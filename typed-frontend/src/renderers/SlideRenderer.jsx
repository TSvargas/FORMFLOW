// =============================================================================
// TypeD V2 — SlideRenderer (Motor Visual do Modo Slide)
// =============================================================================
//
// RESPONSABILIDADE:
// Renderiza o formulário como uma interface Typeform-like: uma pergunta
// centralizada por tela, com transições suaves entre slides.
//
// DIFERENÇA VS CHAT:
// O SlideRenderer usa DIRETAMENTE o currentStepIndex do FormEngine
// porque o modelo 1:1 (um bloco = um slide) mapeia perfeitamente.
// Não precisa de timeline visual própria como o ChatRenderer.
//
// Blocos TEXT/WAIT são exibidos como slides informativos com botão
// de "Continuar". O lead controla o ritmo (sem delay automático).
//
// NAVEGAÇÃO:
// - Enter → Avança (submete resposta ou skip)
// - Botão "Voltar" → goToStep(index - 1)
// - Botão CTA → Submete e avança
// - Navegação por teclado é essencial para acessibilidade
//
// =============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { useFormEngine } from '../context/FormEngineProvider.jsx';
import PhoneInput from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { validateInput } from '../lib/validation.js';
import './SlideRenderer.css';

function formatCPF(value) {
  const v = value.replace(/\D/g, '').slice(0, 11);
  if (v.length <= 3) return v;
  if (v.length <= 6) return `${v.slice(0, 3)}.${v.slice(3)}`;
  if (v.length <= 9) return `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6)}`;
  return `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6, 9)}-${v.slice(9)}`;
}

// =============================================================================
// SUB-COMPONENTE: IframeCalendarInput
// =============================================================================
function IframeCalendarInput({ block, onSubmit }) {
  const { config = {} } = block;

  useEffect(() => {
    function handleMessage(e) {
      let isSuccess = false;
      if (config.calendarProvider === 'Calendly' && e.data?.event === 'calendly.event_scheduled') {
        isSuccess = true;
      } else if (config.calendarProvider === 'Cal.com') {
        try {
          const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
          if (data?.type === 'cal:booking:success') {
            isSuccess = true;
          }
        } catch (err) {}
      }

      if (isSuccess) {
        window.removeEventListener('message', handleMessage);
        onSubmit('Reunião Agendada');
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [config.calendarProvider, onSubmit]);

  if (!config.calendarUrl) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#888', backgroundColor: '#f8f9fa', borderRadius: '12px', width: '100%' }}>
        <p>URL de agendamento não configurada.</p>
        <button className="td-slide-cta" onClick={() => onSubmit('Sem resposta')} type="button" style={{marginTop: '1rem'}}>
          Avançar
        </button>
      </div>
    );
  }

  return (
    <iframe
      src={config.calendarUrl}
      style={{ width: '100%', height: '600px', border: 'none', borderRadius: '12px' }}
      title="Agendamento"
    />
  );
}

// =============================================================================
// SUB-COMPONENTE: Input por BlockType (versão Slide)
// =============================================================================
// Similar ao ChatRenderer mas com styling maior e centralizado.
// Cada tipo recebe onSubmit(value) para enviar a resposta.
// Inclui validação rígida para EMAIL e PHONE.
// =============================================================================
function SlideInput({ block, onSubmit, branding }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  // Auto-focus ao montar e quando o bloco muda.
  useEffect(() => {
    setValue('');
    setError(null);
    const timer = setTimeout(() => inputRef.current?.focus(), 150);
    return () => clearTimeout(timer);
  }, [block?.id]);

  const handleSubmit = useCallback(() => {
    let finalValue = typeof value === 'string' ? value.trim() : value;
    if (block?.type === 'INPUT_CPF') {
      finalValue = typeof finalValue === 'string' ? finalValue.replace(/\D/g, '') : finalValue;
    }

    if (!finalValue && finalValue !== 0) return;

    // Validação rígida
    const validation = validateInput(block?.type, finalValue);
    if (!validation.valid) {
      setError(validation.message);
      return;
    }

    setError(null);
    onSubmit(finalValue);
  }, [value, onSubmit, block?.type]);

  // Navegação por teclado global.
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        // Só submete se o input tem valor OU se não é um campo de input.
        const trimmed = typeof value === 'string' ? value.trim() : value;
        if (trimmed || trimmed === 0) {
          e.preventDefault();
          handleSubmit();
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [value, handleSubmit]);

  if (!block) return null;

  const { type, config = {} } = block;
  const placeholder = config.placeholder || 'Digite aqui...';

  // --- Mensagem de erro visual ---
  const ErrorMessage = error ? (
    <span className="td-slide-input-error">{error}</span>
  ) : null;

  // --- INPUT_BUTTONS / INPUT_SELECT: Grid de opções ---
  if (type === 'INPUT_BUTTONS' || type === 'INPUT_SELECT') {
    const options = config.options || config.buttons || [];
    if (options.length === 0) {
      return (
        <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', color: '#888'}}>
          <p style={{margin: 0, fontSize: '0.9rem', fontStyle: 'italic'}}>Nenhuma opção foi configurada neste bloco.</p>
          <button className="td-slide-cta" onClick={() => onSubmit('Sem resposta')} type="button">
            Avançar
          </button>
        </div>
      );
    }
    return (
      <div className="td-slide-options">
        {options.map((opt, i) => {
          const label = typeof opt === 'string' ? opt : opt.label;
          const val = typeof opt === 'string' ? opt : (opt.value || opt.label);
          return (
            <button
              key={`${block.id}-opt-${i}`}
              className="td-slide-option"
              onClick={() => onSubmit(val)}
              type="button"
            >
              {label}
            </button>
          );
        })}
      </div>
    );
  }

  // --- INPUT_TEXTAREA ---
  if (type === 'INPUT_TEXTAREA') {
    return (
      <>
        <textarea
          ref={inputRef}
          className="td-slide-textarea"
          placeholder={placeholder}
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(null); }}
          rows={4}
        />
        {ErrorMessage}
        <button
          className="td-slide-cta"
          onClick={handleSubmit}
          disabled={!value.trim()}
          type="button"
        >
          Continuar
        </button>
        <span className="td-slide-cta-hint">
          ou pressione <kbd>{branding?.slideEnterText || 'Enter'}</kbd>
        </span>
      </>
    );
  }

  // --- INPUT_PHONE: Componente com seletor de país e máscara ---
  if (type === 'INPUT_PHONE') {
    return (
      <>
        <PhoneInput
          ref={inputRef}
          international
          defaultCountry="BR"
          placeholder={placeholder}
          value={value}
          onChange={(val) => { setValue(val || ''); setError(null); }}
          className="td-slide-phone-input"
        />
        {ErrorMessage}
        <button
          className="td-slide-cta"
          onClick={handleSubmit}
          disabled={!value}
          type="button"
        >
          Continuar
        </button>
        <span className="td-slide-cta-hint">
          ou pressione <kbd>{branding?.slideEnterText || 'Enter'}</kbd>
        </span>
      </>
    );
  }

  // --- INPUT_EMAIL: Input com validação visual ---
  if (type === 'INPUT_EMAIL') {
    return (
      <>
        <input
          ref={inputRef}
          type="email"
          className={`td-slide-input ${error ? 'td-slide-input--error' : ''}`}
          placeholder={placeholder}
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(null); }}
          autoComplete="email"
        />
        {ErrorMessage}
        <button
          className="td-slide-cta"
          onClick={handleSubmit}
          disabled={!value.trim()}
          type="button"
        >
          Continuar
        </button>
        <span className="td-slide-cta-hint">
          ou pressione <kbd>{branding?.slideEnterText || 'Enter'}</kbd>
        </span>
      </>
    );
  }

  // --- INPUT_CPF ---
  if (type === 'INPUT_CPF') {
    return (
      <>
        <input
          ref={inputRef}
          type="text"
          className={`td-slide-input ${error ? 'td-slide-input--error' : ''}`}
          placeholder={placeholder || '000.000.000-00'}
          value={value}
          onChange={(e) => { setValue(formatCPF(e.target.value)); setError(null); }}
        />
        {ErrorMessage}
        <button
          className="td-slide-cta"
          onClick={handleSubmit}
          disabled={!value.trim()}
          type="button"
        >
          Continuar
        </button>
        <span className="td-slide-cta-hint">
          ou pressione <kbd>{branding?.slideEnterText || 'Enter'}</kbd>
        </span>
      </>
    );
  }

  // --- REDIRECT ---
  if (type === 'REDIRECT') {
    return (
      <div className="td-slide-options">
        <button
          className="td-slide-option"
          onClick={() => {
            if (config.url) window.open(config.url, '_blank');
            onSubmit('Redirecionado');
          }}
          type="button"
        >
          {config.buttonText || 'Acessar Link'}
        </button>
      </div>
    );
  }

  // --- INPUT_DATE (Iframe) ---
  if (type === 'INPUT_DATE' && (config.calendarProvider === 'Calendly' || config.calendarProvider === 'Cal.com')) {
    return <IframeCalendarInput block={block} onSubmit={onSubmit} />;
  }

  // --- INPUT_RATING ---
  if (type === 'INPUT_RATING') {
    const maxScore = config.maxScore || 5;
    const options = Array.from({ length: maxScore === 10 ? 11 : maxScore }, (_, i) => maxScore === 10 ? i : i + 1);

    return (
      <div className="td-slide-options" style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
        {options.map((score) => (
          <button
            key={`${block.id}-rating-${score}`}
            className="td-slide-option"
            style={{ flex: 'none', padding: maxScore === 10 ? '1rem 1.5rem' : '1rem', minWidth: '60px' }}
            onClick={() => onSubmit(score)}
            type="button"
          >
            {maxScore === 5 ? '⭐' : score}
          </button>
        ))}
      </div>
    );
  }

  // --- Mapeamento de type → input HTML type ---
  const inputTypeMap = {
    INPUT_TEXT: 'text',
    INPUT_NUMBER: 'number',
    INPUT_DATE: config.enableTime ? 'datetime-local' : 'date',
  };

  const htmlType = inputTypeMap[type] || 'text';

  // --- Input padrão grande ---
  return (
    <>
      <input
        ref={inputRef}
        type={htmlType}
        className="td-slide-input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => { setValue(e.target.value); setError(null); }}
        autoComplete="off"
      />
      {ErrorMessage}
      <button
        className="td-slide-cta"
        onClick={handleSubmit}
        disabled={!value.toString().trim()}
        type="button"
      >
        Continuar
      </button>
      <span className="td-slide-cta-hint">
        ou pressione <kbd>Enter</kbd>
      </span>
    </>
  );
}

// =============================================================================
// COMPONENTE PRINCIPAL: SlideRenderer
// =============================================================================
export default function SlideRenderer() {
  const {
    formConfig,
    currentBlock,
    currentStepIndex,
    totalSteps,
    progress,
    isLastStep,
    submitAnswer,
    submitFinal,
    skipBlock,
    goToStep,
    status,
  } = useFormEngine();

  // Key para forçar re-mount do slide card (re-trigger da animação CSS).
  const [slideKey, setSlideKey] = useState(0);

  // -------------------------------------------------------------------------
  // BRANDING: Aplicar variáveis CSS dinâmicas do branding
  // -------------------------------------------------------------------------
  const branding = formConfig?.branding || {};
  const accentColor = branding.primaryColor || '#6C63FF';
  const textColor = branding.textColor || '#1a1a2e';
  const fontFamily = branding.fontFamily || '';

  const brandingVars = {
    '--td-accent': accentColor,
    '--td-text': textColor,
    '--td-slide-helper': branding.slideHelperTextColor || '#8c8c9a',
    '--td-slide-support-bg': branding.slideSupportBtnBgColor || '#f0f2f5',
    '--td-slide-support-text': branding.slideSupportBtnTextColor || '#8c8c9a',
    ...(fontFamily ? { '--td-font': `"${fontFamily}", sans-serif` } : {}),
  };

  // Atualiza a key quando o step muda para re-trigger da animação.
  useEffect(() => {
    setSlideKey((prev) => prev + 1);
  }, [currentStepIndex]);

  // -------------------------------------------------------------------------
  // HANDLER: Utilizador submete resposta
  // -------------------------------------------------------------------------
  const handleSubmit = useCallback((value) => {
    if (!currentBlock) return;

    if (isLastStep) {
      // Último bloco: submete resposta e finaliza.
      submitAnswer(currentBlock.id, value);
      // Delay mínimo para o submitAnswer processar antes do final.
      setTimeout(() => submitFinal(), 100);
    } else {
      submitAnswer(currentBlock.id, value);
    }
  }, [currentBlock, isLastStep, submitAnswer, submitFinal]);

  // -------------------------------------------------------------------------
  // HANDLER: Skip para blocos sem input (TEXT, WAIT)
  // -------------------------------------------------------------------------
  const handleSkip = useCallback(() => {
    if (isLastStep) {
      submitFinal();
    } else {
      skipBlock();
    }
  }, [isLastStep, skipBlock, submitFinal]);

  // Navegação global por teclado para blocos auto.
  useEffect(() => {
    if (!currentBlock) return;
    const isAutoBlock = ['TEXT', 'WAIT', 'END_SCREEN'].includes(currentBlock.type);
    if (!isAutoBlock) return;

    function handleKey(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSkip();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [currentBlock, handleSkip]);

  const canGoBack = currentStepIndex > 0;
  const isInputBlock = currentBlock?.type?.startsWith('INPUT_') || currentBlock?.type === 'REDIRECT';
  const isAutoBlock = currentBlock && ['TEXT', 'WAIT'].includes(currentBlock.type);
  const isEndScreen = currentBlock?.type === 'END_SCREEN';

  // =========================================================================
  // RENDER: Estados especiais
  // =========================================================================

  if (status === 'loading' || status === 'idle') {
    return (
      <div className="td-slide-loading" style={brandingVars}>
        <div className="td-slide-spinner" />
        <span>Carregando...</span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="td-slide-error">
        <span style={{ fontSize: '2.5rem' }}>😕</span>
        <p>Este formulário não está disponível no momento.</p>
      </div>
    );
  }

  if (status === 'completed') {
    const blocks = formConfig?.blocks || [];
    const endBlock = [...blocks].reverse().find(b => b.type === 'END_SCREEN');
    const title = endBlock?.label || 'Respostas enviadas!';
    const message = endBlock?.config?.message || 'Obrigado por completar o formulário. As suas respostas foram registadas com sucesso.';

    return (
      <div className="td-slide-completed" style={brandingVars}>
        <div className="td-slide-completed-icon">✓</div>
        <h2>{title}</h2>
        <p>{message}</p>
      </div>
    );
  }

  // =========================================================================
  // RENDER: Interface Slide
  // =========================================================================
  const question = currentBlock?.label
    || currentBlock?.config?.message
    || currentBlock?.config?.placeholder
    || '';

  const description = currentBlock?.config?.description || null;

  return (
    <div className="td-slide-container" style={brandingVars}>
      {/* Barra de progresso */}
      <div className="td-slide-progress">
        <div
          className="td-slide-progress-bar"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Contador de steps */}
      <div className="td-slide-header">
        {currentStepIndex + 1} / {totalSteps}
      </div>

      {/* Conteúdo do Slide */}
      <div className="td-slide-wrapper">
        <div className="td-slide-card" key={slideKey}>
          {/* Step counter visual */}
          <span className="td-slide-step-counter">
            Pergunta {currentStepIndex + 1}
          </span>

          {/* Pergunta */}
          {question && (
            <h2 className="td-slide-question">{question}</h2>
          )}

          {/* Descrição opcional */}
          {description && (
            <p className="td-slide-description">{description}</p>
          )}

          {/* END_SCREEN: Mensagem final + botão de envio */}
          {isEndScreen && (
            <>
              <button
                className="td-slide-cta"
                onClick={() => submitFinal()}
                type="button"
              >
                Enviar Respostas
              </button>
            </>
          )}

          {/* Blocos auto (TEXT / WAIT): Botão de continuar */}
          {isAutoBlock && (
            <>
              <button
                className="td-slide-cta"
                onClick={handleSkip}
                type="button"
              >
                Continuar
              </button>
              <span className="td-slide-cta-hint">
                ou pressione <kbd>{branding?.slideEnterText || 'Enter'}</kbd>
              </span>
            </>
          )}

          {/* Blocos de input: Renderiza campo adequado */}
          {isInputBlock && (
            <SlideInput
              block={currentBlock}
              onSubmit={handleSubmit}
              branding={branding}
            />
          )}
        </div>
      </div>

      <div className="td-slide-nav">
        <button
          className={`td-slide-nav-btn ${!canGoBack ? 'td-slide-nav-btn--hidden' : ''}`}
          onClick={() => goToStep(currentStepIndex - 1)}
          type="button"
        >
          &larr; {branding?.slideBackText || 'Voltar'}
        </button>

        <span style={{ fontSize: '0.72rem', color: '#c8c8d0' }}>
          Powered by TypeD
        </span>

        {/* Espaçador para manter o "Powered by" centralizado */}
        <div className="td-slide-nav-btn td-slide-nav-btn--hidden">
          &larr; {branding?.slideBackText || 'Voltar'}
        </div>
      </div>
    </div>
  );
}
