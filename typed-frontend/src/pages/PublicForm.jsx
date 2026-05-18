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

import { useParams } from 'react-router-dom';
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

  // --- Estado: Formulário carregado — rotear por displayMode ---
  if (status === 'ready' || status === 'submitting') {
    switch (formConfig?.displayMode) {
      case 'CHAT':
        return <ChatRenderer />;

      case 'SLIDE':
        return <SlideRenderer />;

      default:
        // Fallback seguro — se o displayMode for desconhecido, usa CHAT.
        // Isso garante que o lead nunca vê uma página em branco.
        console.warn(
          `[TypeD] DisplayMode desconhecido: "${formConfig?.displayMode}". Usando CHAT como fallback.`
        );
        return <ChatRenderer />;
    }
  }

  // --- Estado: Concluído ---
  if (status === 'completed') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', flexDirection: 'column', gap: '1rem' }}>
        <h2>✓ Obrigado!</h2>
        <p>Suas respostas foram enviadas com sucesso.</p>
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
    <FormEngineProvider slug={slug}>
      <FormRouter />
    </FormEngineProvider>
  );
}
