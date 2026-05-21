// =============================================================================
// TypeD V2 — PublicForm (Roteador Dinâmico de Display Mode)
// =============================================================================
//
// RESPONSABILIDADE:
// Esta página é o ponto de entrada público para qualquer formulário.
// O lead acede a /f/:slug e este componente:
//   1. Extrai o slug da URL
//   2. Envolve tudo no FormEngineProvider (que faz o fetch)
//   3. Lê o displayMode do formConfig
//   4. Renderiza o Renderer correto (Chat ou Slide)
//
// AGNOSTICISMO VISUAL:
// Este componente NÃO sabe como desenhar nada. Ele é apenas um roteador
// que decide QUAL renderer usar baseado no displayMode.
// Adicionar um novo modo (ex: WIZARD) = adicionar um case aqui + um renderer.
//
// =============================================================================

import { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { FormEngineProvider, useFormEngine } from '../context/FormEngineProvider.jsx';
import ChatRenderer from '../renderers/ChatRenderer.jsx';
import SlideRenderer from '../renderers/SlideRenderer.jsx';

// =============================================================================
// INNER COMPONENT: Consome o contexto e decide o renderer
// =============================================================================
// Separamos este componente porque o useFormEngine() precisa estar
// DENTRO do FormEngineProvider. Se tentarmos usar o hook no mesmo
// componente que renderiza o Provider, o contexto ainda não existe.
// =============================================================================
function FormRouter() {
  const { status, formConfig, error } = useFormEngine();

  // Carregar a fonte dinamicamente se existir no branding
  useEffect(() => {
    const fontFamily = formConfig?.branding?.fontFamily;
    if (fontFamily) {
      const link = document.createElement('link');
      link.href = `https://fonts.googleapis.com/css2?family=${fontFamily.replace(/ /g, '+')}:wght@400;500;600;700&display=swap`;
      link.rel = 'stylesheet';
      document.head.appendChild(link);
      return () => {
        document.head.removeChild(link);
      };
    }
  }, [formConfig?.branding?.fontFamily]);

  // --- Estado: Carregando ---
  if (status === 'loading' || status === 'idle') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <p>Carregando formulário...</p>
      </div>
    );
  }

  // --- Estado: Erro ---
  if (status === 'error') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', flexDirection: 'column', gap: '1rem' }}>
        <h2>Formulário indisponível</h2>
        {/* SEGURANÇA: Não exibir mensagem de erro técnica ao lead.
            O erro real já foi logado no console pelo ApiError. */}
        <p>Este formulário não está disponível no momento.</p>
      </div>
    );
  }

  // --- Estado: Formulário carregado ou Concluído — rotear por displayMode ---
  if (status === 'ready' || status === 'submitting' || status === 'completed') {
    const branding = formConfig?.branding || {};
    const API_BASE = import.meta.env.VITE_API_URL || '';
    
    // Injeção de CSS Dinâmico com Variáveis
    const wrapperStyle = {
      '--td-accent': branding.primaryColor || '#6C63FF',
      '--td-text': branding.textColor || '#1a1a2e',
      '--td-secondary': branding.secondaryColor || '#ffffff',
      fontFamily: branding.fontFamily ? `"${branding.fontFamily}", sans-serif` : undefined,
      width: '100%',
      minHeight: '100vh',
      backgroundColor: branding.backgroundColor || '#f0f2f5',
    };

    // Propagar fonte como CSS variable para componentes filhos (ChatRenderer, etc.)
    if (branding.fontFamily) {
      wrapperStyle['--td-font'] = `"${branding.fontFamily}", sans-serif`;
    }

    if (branding.backgroundImage) {
      const bgUrl = `url(${API_BASE}${branding.backgroundImage})`;
      wrapperStyle['--td-bg-image'] = bgUrl;
      wrapperStyle.backgroundImage = bgUrl;
      wrapperStyle.backgroundSize = 'cover';
      wrapperStyle.backgroundPosition = 'center';
      wrapperStyle.backgroundRepeat = 'no-repeat';
    }

    let Renderer = ChatRenderer;
    if (formConfig?.displayMode === 'SLIDE') {
      Renderer = SlideRenderer;
    } else if (formConfig?.displayMode !== 'CHAT') {
      console.warn(
        `[TypeD] DisplayMode desconhecido: "${formConfig?.displayMode}". Usando CHAT como fallback.`
      );
    }

    return (
      <div style={wrapperStyle}>
        <Renderer />
      </div>
    );
  }

  return null;
}

// =============================================================================
// PAGE COMPONENT: Extrai slug da URL e monta o Provider
// =============================================================================
export default function PublicForm() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const isPreview = searchParams.get('preview') === 'true';

  // SEGURANÇA: Validar que o slug existe e tem formato aceitável.
  // Previne requests com slugs vazios ou com caracteres perigosos.
  if (!slug || slug.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(slug)) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <p>Endereço inválido.</p>
      </div>
    );
  }

  return (
    <FormEngineProvider slug={slug} preview={isPreview}>
      <FormRouter />
    </FormEngineProvider>
  );
}
