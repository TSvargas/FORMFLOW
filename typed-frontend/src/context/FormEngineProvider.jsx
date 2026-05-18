// =============================================================================
// TypeD V2 — FormEngineProvider (O Cérebro do Formulário)
// =============================================================================
//
// RESPONSABILIDADE ÚNICA:
// Este contexto é o MOTOR INVISÍVEL do formulário. Ele controla:
//   1. Fetch dos dados do form via API
//   2. Estado da sessão (bloco atual, respostas, loading, erros)
//   3. Navegação entre blocos (avançar/recuar)
//   4. Validação básica (campo required)
//   5. Submissão parcial (anti-abandono) e final
//   6. Coleta automática de metadados (UTMs, browser)
//
// AGNOSTICISMO VISUAL:
// Este provider NÃO sabe como o formulário é renderizado.
// Ele apenas expõe estado e funções. Os Renderers (ChatRenderer,
// SlideRenderer) consomem o hook useFormEngine() e desenham conforme
// o displayMode. Um novo modo (ex: WIZARD) precisaria apenas de um
// novo Renderer — ZERO mudanças aqui.
//
// SEGURANÇA:
// - AbortController no fetch (cleanup no unmount)
// - Prevenção de double-submit via flag isSubmitting
// - Metadata coletada localmente (não confia em dados do backend)
// - Sem exposição de dados internos (workspaceId, etc.)
//
// =============================================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import { fetchPublicForm, submitForm, savePartial } from '../lib/api.js';

// =============================================================================
// CONTEXT
// =============================================================================
const FormEngineContext = createContext(null);

// =============================================================================
// REDUCER — Estado imutável e previsível
// =============================================================================
// Usamos useReducer ao invés de múltiplos useState porque:
// 1. O estado tem campos interdependentes (currentStepIndex ↔ answers)
// 2. Evita race conditions entre setState assíncronos
// 3. Facilita debugging (cada action é um evento rastreável)
// 4. Previne re-renders desnecessários (um dispatch vs. 4 setState)
// =============================================================================

const initialState = {
  /** @type {'idle'|'loading'|'ready'|'submitting'|'completed'|'error'} */
  status: 'idle',

  /** Dados do formulário retornados pela API (form + blocks) */
  formConfig: null,

  /** Índice do bloco atualmente ativo (0-based) */
  currentStepIndex: 0,

  /** Respostas acumuladas: { [blockId]: value } */
  answers: {},

  /** ID da submission parcial (retornado pelo backend no primeiro /partial) */
  partialSubmissionId: null,

  /** ID da submission final (retornado pelo backend no /submit) */
  finalSubmissionId: null,

  /** Mensagem de erro (se houver) */
  error: null,
};

function formReducer(state, action) {
  switch (action.type) {
    // --- Lifecycle ---
    case 'FETCH_START':
      return { ...state, status: 'loading', error: null };

    case 'FETCH_SUCCESS':
      return {
        ...state,
        status: 'ready',
        formConfig: action.payload,
        currentStepIndex: 0,
        answers: {},
        error: null,
      };

    case 'FETCH_ERROR':
      return { ...state, status: 'error', error: action.payload };

    // --- Navegação ---
    case 'SUBMIT_ANSWER': {
      const { blockId, value } = action.payload;
      const updatedAnswers = { ...state.answers, [blockId]: value };
      const totalBlocks = state.formConfig?.blocks?.length ?? 0;
      const nextIndex = state.currentStepIndex + 1;

      // Se ainda há blocos, avança. Senão, mantém no último.
      return {
        ...state,
        answers: updatedAnswers,
        currentStepIndex: nextIndex < totalBlocks ? nextIndex : state.currentStepIndex,
      };
    }

    case 'GO_TO_STEP':
      return {
        ...state,
        currentStepIndex: Math.max(
          0,
          Math.min(action.payload, (state.formConfig?.blocks?.length ?? 1) - 1)
        ),
      };

    case 'SKIP_BLOCK': {
      const totalBlocks = state.formConfig?.blocks?.length ?? 0;
      const nextIndex = state.currentStepIndex + 1;
      return {
        ...state,
        currentStepIndex: nextIndex < totalBlocks ? nextIndex : state.currentStepIndex,
      };
    }

    // --- Submissão ---
    case 'SUBMIT_START':
      return { ...state, status: 'submitting', error: null };

    case 'SUBMIT_SUCCESS':
      return {
        ...state,
        status: 'completed',
        finalSubmissionId: action.payload.submissionId,
      };

    case 'SUBMIT_ERROR':
      return { ...state, status: 'ready', error: action.payload };

    // --- Partial save ---
    case 'PARTIAL_SAVED':
      return {
        ...state,
        partialSubmissionId: action.payload.submissionId,
      };

    default:
      return state;
  }
}

// =============================================================================
// HELPERS: Coleta de Metadados do Browser
// =============================================================================
// Estes dados são coletados NO CLIENTE e enviados junto com a submissão.
// O backend NÃO confia nestes dados para lógica de negócio — são apenas
// para analytics e segmentação de leads.
// =============================================================================

function collectMetadata() {
  const params = new URLSearchParams(window.location.search);

  return {
    // UTMs — padrão de mercado para rastreamento de campanhas.
    utm_source: params.get('utm_source') || null,
    utm_medium: params.get('utm_medium') || null,
    utm_campaign: params.get('utm_campaign') || null,
    utm_term: params.get('utm_term') || null,
    utm_content: params.get('utm_content') || null,

    // Dados do navegador.
    referrer: document.referrer || null,
    language: navigator.language || null,
    userAgent: navigator.userAgent || null,
    screenResolution: `${screen.width}x${screen.height}`,
    viewportSize: `${window.innerWidth}x${window.innerHeight}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,

    // Timestamp local do lead (para comparar com serverTimestamp).
    clientTimestamp: Date.now(),
    pageUrl: window.location.href,
  };
}

// =============================================================================
// PROVIDER COMPONENT
// =============================================================================

/**
 * @param {object} props
 * @param {string} props.slug - Slug do formulário a carregar
 * @param {React.ReactNode} props.children
 */
export function FormEngineProvider({ slug, children }) {
  const [state, dispatch] = useReducer(formReducer, initialState);

  // Refs para prevenir double-submit e manter referência estável.
  const isSubmittingRef = useRef(false);
  const metadataRef = useRef(null);

  // -------------------------------------------------------------------------
  // EFFECT: Fetch do formulário ao montar (ou quando slug muda)
  // -------------------------------------------------------------------------
  // O AbortController garante que se o componente desmontar antes do
  // fetch completar, a request é cancelada e o setState é ignorado.
  // Sem isto, teríamos "setState on unmounted component" warnings.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!slug) return;

    const controller = new AbortController();

    async function loadForm() {
      dispatch({ type: 'FETCH_START' });

      try {
        const data = await fetchPublicForm(slug, controller.signal);

        // SEGURANÇA: Validar estrutura mínima da resposta.
        // Previne crash se a API retornar dados inesperados.
        if (!data || !Array.isArray(data.blocks) || !data.displayMode) {
          throw new Error('Resposta da API com formato inválido.');
        }

        dispatch({ type: 'FETCH_SUCCESS', payload: data });

        // Coleta metadata uma vez ao carregar o form.
        metadataRef.current = collectMetadata();
      } catch (err) {
        // Ignora erros de abort (unmount).
        if (err.name === 'AbortError' || controller.signal.aborted) return;
        dispatch({ type: 'FETCH_ERROR', payload: err.message });
      }
    }

    loadForm();

    return () => controller.abort();
  }, [slug]);

  // -------------------------------------------------------------------------
  // COMPUTED: Bloco atual derivado do estado
  // -------------------------------------------------------------------------
  const currentBlock = useMemo(() => {
    if (!state.formConfig?.blocks) return null;
    return state.formConfig.blocks[state.currentStepIndex] ?? null;
  }, [state.formConfig, state.currentStepIndex]);

  const totalSteps = state.formConfig?.blocks?.length ?? 0;
  const isLastStep = state.currentStepIndex >= totalSteps - 1;
  const progress = totalSteps > 0
    ? Math.round(((state.currentStepIndex + 1) / totalSteps) * 100)
    : 0;

  // -------------------------------------------------------------------------
  // ACTION: Submeter resposta de um bloco e avançar
  // -------------------------------------------------------------------------
  const submitAnswer = useCallback(async (blockId, value) => {
    if (!state.formConfig) return;

    // Avança o step no estado local.
    dispatch({ type: 'SUBMIT_ANSWER', payload: { blockId, value } });

    // Salva parcialmente no backend (fire-and-forget, sem bloquear UX).
    // O try/catch silencioso é intencional — se o partial save falhar,
    // o lead ainda pode completar o form normalmente.
    try {
      const updatedAnswers = { ...state.answers, [blockId]: value };
      const result = await savePartial(
        slug,
        updatedAnswers,
        metadataRef.current,
        state.partialSubmissionId
      );
      if (result?.submissionId) {
        dispatch({ type: 'PARTIAL_SAVED', payload: result });
      }
    } catch {
      // Silencioso — partial save é best-effort.
    }
  }, [slug, state.formConfig, state.answers, state.partialSubmissionId]);

  // -------------------------------------------------------------------------
  // ACTION: Submissão final do formulário
  // -------------------------------------------------------------------------
  // SEGURANÇA: Double-submit prevention via ref + status check.
  // O ref é necessário porque o useCallback pode ter closure stale do state.
  // Belt-and-suspenders: verificamos AMBOS ref e status.
  // -------------------------------------------------------------------------
  const submitFinal = useCallback(async () => {
    if (isSubmittingRef.current || state.status === 'submitting') return;
    if (!state.formConfig) return;

    isSubmittingRef.current = true;
    dispatch({ type: 'SUBMIT_START' });

    try {
      const result = await submitForm(
        slug,
        state.answers,
        metadataRef.current
      );
      dispatch({ type: 'SUBMIT_SUCCESS', payload: result });
    } catch (err) {
      dispatch({ type: 'SUBMIT_ERROR', payload: err.message });
    } finally {
      isSubmittingRef.current = false;
    }
  }, [slug, state.formConfig, state.answers, state.status]);

  // -------------------------------------------------------------------------
  // ACTION: Navegar para um step específico (usado pelo SlideRenderer)
  // -------------------------------------------------------------------------
  const goToStep = useCallback((index) => {
    dispatch({ type: 'GO_TO_STEP', payload: index });
  }, []);

  // -------------------------------------------------------------------------
  // ACTION: Pular bloco não-obrigatório (TEXT, WAIT, etc.)
  // -------------------------------------------------------------------------
  const skipBlock = useCallback(() => {
    dispatch({ type: 'SKIP_BLOCK' });
  }, []);

  // -------------------------------------------------------------------------
  // CONTEXT VALUE — Memoizado para prevenir re-renders nos consumers
  // -------------------------------------------------------------------------
  const contextValue = useMemo(() => ({
    // Estado
    status: state.status,
    formConfig: state.formConfig,
    currentStepIndex: state.currentStepIndex,
    currentBlock,
    answers: state.answers,
    error: state.error,
    finalSubmissionId: state.finalSubmissionId,

    // Computados
    totalSteps,
    isLastStep,
    progress,

    // Ações
    submitAnswer,
    submitFinal,
    goToStep,
    skipBlock,
  }), [
    state.status,
    state.formConfig,
    state.currentStepIndex,
    currentBlock,
    state.answers,
    state.error,
    state.finalSubmissionId,
    totalSteps,
    isLastStep,
    progress,
    submitAnswer,
    submitFinal,
    goToStep,
    skipBlock,
  ]);

  return (
    <FormEngineContext.Provider value={contextValue}>
      {children}
    </FormEngineContext.Provider>
  );
}

// =============================================================================
// HOOK: useFormEngine()
// =============================================================================
// Hook customizado para consumir o contexto.
// Lança erro explícito se usado fora do Provider — isso previne bugs
// silenciosos onde o hook retorna undefined e causa NaN/null em runtime.
// =============================================================================
export function useFormEngine() {
  const context = useContext(FormEngineContext);
  if (!context) {
    throw new Error(
      'useFormEngine() deve ser usado dentro de <FormEngineProvider>. ' +
      'Verifique se o componente está envolto pelo provider.'
    );
  }
  return context;
}
