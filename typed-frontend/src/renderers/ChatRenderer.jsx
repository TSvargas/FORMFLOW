// =============================================================================
// TypeD V2 — ChatRenderer (Motor Visual do Modo Chat)
// =============================================================================
//
// RESPONSABILIDADE:
// Renderiza o formulário como uma interface conversacional tipo iMessage.
// Gerencia sua própria timeline visual (mensagens + typing + delays)
// consumindo dados e ações do FormEngine via useFormEngine().
//
// ARQUITETURA INTERNA:
// O ChatRenderer mantém estado visual PRÓPRIO (messages[], isTyping)
// separado do FormEngine. Isso é necessário porque o chat precisa de:
//   - Delay de digitação antes de cada mensagem do bot
//   - Acumulação visual de histórico de mensagens
//   - Timing diferente do avanço lógico do FormEngine
//
// O FormEngine é usado apenas para:
//   - formConfig/blocks (dados)
//   - submitAnswer() (gravar respostas)
//   - submitFinal() (submissão final)
//   - status (loading/error/completed)
//   - answers (acumuladas)
//
// =============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { useFormEngine } from '../context/FormEngineProvider.jsx';
import './ChatRenderer.css';

// =============================================================================
// SUB-COMPONENTE: Typing Indicator (3 pontos animados)
// =============================================================================
function TypingIndicator() {
  return (
    <div className="td-chat-typing">
      <div className="td-chat-typing-dot" />
      <div className="td-chat-typing-dot" />
      <div className="td-chat-typing-dot" />
    </div>
  );
}

// =============================================================================
// SUB-COMPONENTE: Balão de Mensagem
// =============================================================================
function MessageBubble({ sender, children }) {
  return (
    <div className={`td-chat-bubble td-chat-bubble--${sender}`}>
      {children}
    </div>
  );
}

// =============================================================================
// SUB-COMPONENTE: Input por BlockType
// =============================================================================
// Renderiza o campo de input adequado ao tipo do bloco atual.
// Cada tipo recebe onSubmit(value) para enviar a resposta.
// =============================================================================
function BlockInput({ block, onSubmit }) {
  const [value, setValue] = useState('');
  const inputRef = useRef(null);

  // Auto-focus quando o input aparece.
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, [block?.id]);

  // Reset do valor quando o bloco muda.
  useEffect(() => { setValue(''); }, [block?.id]);

  const handleSubmit = useCallback(() => {
    const trimmed = typeof value === 'string' ? value.trim() : value;
    if (!trimmed && trimmed !== 0) return;
    onSubmit(trimmed);
    setValue('');
  }, [value, onSubmit]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  if (!block) return null;

  const { type, config = {} } = block;
  const placeholder = config.placeholder || 'Digite sua resposta...';

  // --- INPUT_BUTTONS / INPUT_SELECT ---
  if (type === 'INPUT_BUTTONS' || type === 'INPUT_SELECT') {
    const options = config.options || config.buttons || [];
    if (options.length === 0) {
      return (
        <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem', color: '#888'}}>
          <p style={{margin: 0, fontSize: '0.85rem', fontStyle: 'italic'}}>Nenhuma opção configurada.</p>
          <button className="td-chat-option-btn" onClick={() => onSubmit('Sem resposta')} type="button">
            Avançar
          </button>
        </div>
      );
    }
    return (
      <div className="td-chat-input-area">
        <div className="td-chat-input-wrapper">
          <div className="td-chat-options">
            {options.map((opt, i) => {
              const label = typeof opt === 'string' ? opt : opt.label;
              const val = typeof opt === 'string' ? opt : (opt.value || opt.label);
              return (
                <button
                  key={`${block.id}-opt-${i}`}
                  className="td-chat-option-btn"
                  onClick={() => onSubmit(val)}
                  type="button"
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // --- INPUT_TEXTAREA ---
  if (type === 'INPUT_TEXTAREA') {
    return (
      <div className="td-chat-input-area">
        <div className="td-chat-input-wrapper">
          <textarea
            ref={inputRef}
            className="td-chat-input-field td-chat-input-field--textarea"
            placeholder={placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={3}
          />
        </div>
        <button
          className="td-chat-send-btn"
          onClick={handleSubmit}
          disabled={!value.trim()}
          type="button"
          aria-label="Enviar"
        >
          ➤
        </button>
      </div>
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

  // --- Input padrão (text, email, phone, number, date) ---
  return (
    <div className="td-chat-input-area">
      <div className="td-chat-input-wrapper">
        <input
          ref={inputRef}
          type={htmlType}
          className="td-chat-input-field"
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          autoComplete={type === 'INPUT_EMAIL' ? 'email' : type === 'INPUT_PHONE' ? 'tel' : 'off'}
        />
      </div>
      <button
        className="td-chat-send-btn"
        onClick={handleSubmit}
        disabled={!value.toString().trim()}
        type="button"
        aria-label="Enviar"
      >
        ➤
      </button>
    </div>
  );
}

// =============================================================================
// COMPONENTE PRINCIPAL: ChatRenderer
// =============================================================================
export default function ChatRenderer() {
  const {
    formConfig,
    submitAnswer,
    submitFinal,
    answers,
    status,
  } = useFormEngine();

  // --- Estado visual local ---
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [processingIndex, setProcessingIndex] = useState(0);
  const [waitingForInput, setWaitingForInput] = useState(false);
  const [currentInputBlock, setCurrentInputBlock] = useState(null);

  // Refs
  const messagesEndRef = useRef(null);
  const isProcessingRef = useRef(false);
  const timeoutRef = useRef(null);

  const blocks = formConfig?.blocks || [];
  const typingDelay = formConfig?.settings?.typingDelay ?? 1200;

  // -------------------------------------------------------------------------
  // BRANDING: Aplicar cor de acento via CSS variable
  // -------------------------------------------------------------------------
  const accentColor = formConfig?.branding?.primaryColor || '#6C63FF';

  // -------------------------------------------------------------------------
  // AUTO-SCROLL: Rola suavemente para a última mensagem
  // -------------------------------------------------------------------------
  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, isTyping, scrollToBottom]);

  // -------------------------------------------------------------------------
  // CLEANUP: Limpar timeouts ao desmontar
  // -------------------------------------------------------------------------
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // -------------------------------------------------------------------------
  // PROCESSING LOOP: Processa blocos sequencialmente com delays visuais
  // -------------------------------------------------------------------------
  // Este effect é o coração do ChatRenderer. Quando processingIndex muda:
  //   1. Busca o bloco atual
  //   2. Mostra typing indicator
  //   3. Após delay, revela a mensagem do bot
  //   4. Se for bloco auto (TEXT/WAIT), avança automaticamente
  //   5. Se for INPUT, para e espera o utilizador
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (isProcessingRef.current) return;
    if (processingIndex >= blocks.length) return;
    if (waitingForInput) return;

    const block = blocks[processingIndex];
    if (!block) return;

    isProcessingRef.current = true;

    async function processBlock() {
      const { type, config = {}, label } = block;

      // ---- Blocos invisíveis (pular sem mensagem) ----
      if (type === 'WEBHOOK' || type === 'REDIRECT') {
        isProcessingRef.current = false;
        setProcessingIndex((prev) => prev + 1);
        return;
      }

      // ---- END_SCREEN ----
      if (type === 'END_SCREEN') {
        setIsTyping(true);
        scrollToBottom();

        timeoutRef.current = setTimeout(() => {
          setIsTyping(false);
          const endMessage = config.message || label || 'Obrigado pelas suas respostas!';
          setMessages((prev) => [...prev, {
            id: `msg-${block.id}`,
            sender: 'bot',
            content: endMessage,
            blockType: type,
          }]);
          isProcessingRef.current = false;
          // Dispara submissão final.
          submitFinal();
        }, typingDelay);
        return;
      }

      // ---- TEXT / WAIT (blocos auto-avançáveis) ----
      if (type === 'TEXT' || type === 'WAIT') {
        setIsTyping(true);
        scrollToBottom();

        const delay = type === 'WAIT'
          ? (config.duration || 2000)
          : typingDelay;

        timeoutRef.current = setTimeout(() => {
          setIsTyping(false);

          // TEXT mostra mensagem; WAIT é silencioso.
          if (type === 'TEXT') {
            const text = config.message || label || '...';
            setMessages((prev) => [...prev, {
              id: `msg-${block.id}`,
              sender: 'bot',
              content: text,
              blockType: type,
            }]);
          }

          isProcessingRef.current = false;
          setProcessingIndex((prev) => prev + 1);
        }, delay);
        return;
      }

      // ---- INPUT_* (blocos que requerem resposta do utilizador) ----
      if (type.startsWith('INPUT_')) {
        setIsTyping(true);
        scrollToBottom();

        timeoutRef.current = setTimeout(() => {
          setIsTyping(false);

          // Mostra a pergunta do bot.
          const question = label || config.message || config.placeholder || 'Por favor, responda:';
          setMessages((prev) => [...prev, {
            id: `msg-${block.id}`,
            sender: 'bot',
            content: question,
            blockType: type,
          }]);

          // Ativa o input e espera a resposta.
          setCurrentInputBlock(block);
          setWaitingForInput(true);
          isProcessingRef.current = false;
        }, typingDelay);
        return;
      }

      // ---- Tipo desconhecido → pular ----
      isProcessingRef.current = false;
      setProcessingIndex((prev) => prev + 1);
    }

    processBlock();
  }, [processingIndex, blocks, waitingForInput, typingDelay, scrollToBottom, submitFinal]);

  // -------------------------------------------------------------------------
  // HANDLER: Quando o utilizador submete uma resposta
  // -------------------------------------------------------------------------
  const handleUserSubmit = useCallback((value) => {
    if (!currentInputBlock) return;

    // Adiciona o balão do utilizador ao histórico.
    setMessages((prev) => [...prev, {
      id: `user-${currentInputBlock.id}`,
      sender: 'user',
      content: String(value),
      blockType: currentInputBlock.type,
    }]);

    // Grava a resposta no FormEngine.
    submitAnswer(currentInputBlock.id, value);

    // Limpa o estado e avança.
    setCurrentInputBlock(null);
    setWaitingForInput(false);
    setProcessingIndex((prev) => prev + 1);
  }, [currentInputBlock, submitAnswer]);

  // =========================================================================
  // RENDER: Estados especiais
  // =========================================================================

  if (status === 'loading' || status === 'idle') {
    return (
      <div className="td-chat-loading" style={{ '--td-accent': accentColor }}>
        <div className="td-chat-spinner" />
        <span>Carregando...</span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="td-chat-error">
        <span style={{ fontSize: '2rem' }}>😕</span>
        <p>Este formulário não está disponível no momento.</p>
      </div>
    );
  }

  if (status === 'completed') {
    return (
      <div className="td-chat-container" style={{ '--td-accent': accentColor }}>
        <div className="td-chat-completed">
          <div className="td-chat-completed-icon">✓</div>
          <h2>Respostas enviadas!</h2>
          <p>Obrigado por completar o formulário.</p>
        </div>
      </div>
    );
  }

  // =========================================================================
  // RENDER: Interface de Chat
  // =========================================================================
  const headerInitial = (formConfig?.name || 'T').charAt(0).toUpperCase();

  return (
    <div className="td-chat-container" style={{ '--td-accent': accentColor }}>
      {/* Header */}
      <div className="td-chat-header">
        <div className="td-chat-header-avatar">
          {headerInitial}
        </div>
        <div className="td-chat-header-info">
          <span className="td-chat-header-name">{formConfig?.name || 'TypeD'}</span>
          <span className="td-chat-header-status">Online</span>
        </div>
      </div>

      {/* Área de mensagens */}
      <div className="td-chat-messages">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} sender={msg.sender}>
            {msg.content}
          </MessageBubble>
        ))}

        {isTyping && <TypingIndicator />}

        {/* Scroll anchor */}
        <div ref={messagesEndRef} style={{ height: 1, flexShrink: 0 }} />
      </div>

      {/* Input — só aparece quando esperando resposta do utilizador */}
      {waitingForInput && currentInputBlock && (
        <BlockInput
          block={currentInputBlock}
          onSubmit={handleUserSubmit}
        />
      )}
    </div>
  );
}
