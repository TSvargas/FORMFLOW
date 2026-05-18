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
import './SlideRenderer.css';

// =============================================================================
// SUB-COMPONENTE: Input por BlockType (versão Slide)
// =============================================================================
// Similar ao ChatRenderer mas com styling maior e centralizado.
// Cada tipo recebe onSubmit(value) para enviar a resposta.
// =============================================================================
function SlideInput({ block, onSubmit }) {
  const [value, setValue] = useState('');
  const inputRef = useRef(null);

  // Auto-focus ao montar e quando o bloco muda.
  useEffect(() => {
    setValue('');
    const timer = setTimeout(() => inputRef.current?.focus(), 150);
    return () => clearTimeout(timer);
  }, [block?.id]);

  const handleSubmit = useCallback(() => {
    const trimmed = typeof value === 'string' ? value.trim() : value;
    if (!trimmed && trimmed !== 0) return;
    onSubmit(trimmed);
  }, [value, onSubmit]);

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
          onChange={(e) => setValue(e.target.value)}
          rows={4}
        />
        <button
          className="td-slide-cta"
          onClick={handleSubmit}
          disabled={!value.trim()}
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

  // --- Mapeamento de type → input HTML type ---
  const inputTypeMap = {
    INPUT_TEXT: 'text',
    INPUT_EMAIL: 'email',
    INPUT_PHONE: 'tel',
    INPUT_NUMBER: 'number',
    INPUT_DATE: 'date',
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
        onChange={(e) => setValue(e.target.value)}
        autoComplete={type === 'INPUT_EMAIL' ? 'email' : type === 'INPUT_PHONE' ? 'tel' : 'off'}
      />
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

  // Branding
  const accentColor = formConfig?.branding?.primaryColor || '#6C63FF';

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
  const isInputBlock = currentBlock?.type?.startsWith('INPUT_');
  const isAutoBlock = currentBlock && ['TEXT', 'WAIT'].includes(currentBlock.type);
  const isEndScreen = currentBlock?.type === 'END_SCREEN';

  // =========================================================================
  // RENDER: Estados especiais
  // =========================================================================

  if (status === 'loading' || status === 'idle') {
    return (
      <div className="td-slide-loading" style={{ '--td-accent': accentColor }}>
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
    return (
      <div className="td-slide-completed" style={{ '--td-accent': accentColor }}>
        <div className="td-slide-completed-icon">✓</div>
        <h2>Respostas enviadas!</h2>
        <p>Obrigado por completar o formulário. As suas respostas foram registadas com sucesso.</p>
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
    <div className="td-slide-container" style={{ '--td-accent': accentColor }}>
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
                ou pressione <kbd>Enter</kbd>
              </span>
            </>
          )}

          {/* Blocos de input: Renderiza campo adequado */}
          {isInputBlock && (
            <SlideInput
              block={currentBlock}
              onSubmit={handleSubmit}
            />
          )}
        </div>
      </div>

      {/* Navegação inferior */}
      <div className="td-slide-nav">
        <button
          className={`td-slide-nav-btn ${!canGoBack ? 'td-slide-nav-btn--hidden' : ''}`}
          onClick={() => goToStep(currentStepIndex - 1)}
          type="button"
        >
          ← Voltar
        </button>

        <span style={{ fontSize: '0.72rem', color: '#c8c8d0' }}>
          Powered by TypeD
        </span>

        {/* Espaçador para manter o "Powered by" centralizado */}
        <div className="td-slide-nav-btn td-slide-nav-btn--hidden">
          ← Voltar
        </div>
      </div>
    </div>
  );
}
