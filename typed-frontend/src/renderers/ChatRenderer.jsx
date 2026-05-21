import { useState, useEffect, useRef, useCallback } from 'react';
import { useFormEngine } from '../context/FormEngineProvider.jsx';
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { validateInput } from '../lib/validation.js';
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
// Inclui validação rígida para EMAIL e PHONE.
// =============================================================================
function BlockInput({ block, onSubmit }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  // Auto-focus quando o input aparece.
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, [block?.id]);

  // Reset do valor e erro quando o bloco muda.
  useEffect(() => { setValue(''); setError(null); }, [block?.id]);

  const handleSubmit = useCallback(() => {
    const trimmed = typeof value === 'string' ? value.trim() : value;
    if (!trimmed && trimmed !== 0) return;

    // Validação rígida
    const validation = validateInput(block?.type, value);
    if (!validation.valid) {
      setError(validation.message);
      return;
    }

    setError(null);
    onSubmit(trimmed);
    setValue('');
  }, [value, onSubmit, block?.type]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  if (!block) return null;

  const { type, config = {} } = block;
  const placeholder = config.placeholder || 'Digite sua resposta...';

  // --- Mensagem de erro visual ---
  const ErrorMessage = error ? (
    <span className="td-chat-input-error">{error}</span>
  ) : null;

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
            onChange={(e) => { setValue(e.target.value); setError(null); }}
            onKeyDown={handleKeyDown}
            rows={3}
          />
          {ErrorMessage}
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

  // --- INPUT_PHONE: Componente com seletor de país e máscara ---
  if (type === 'INPUT_PHONE') {
    return (
      <div className="td-chat-input-area">
        <div className="td-chat-input-wrapper">
          <PhoneInput
            ref={inputRef}
            international
            defaultCountry="BR"
            placeholder={placeholder}
            value={value}
            onChange={(val) => { setValue(val || ''); setError(null); }}
            onKeyDown={handleKeyDown}
            className="td-chat-phone-input"
          />
          {ErrorMessage}
        </div>
        <button
          className="td-chat-send-btn"
          onClick={handleSubmit}
          disabled={!value}
          type="button"
          aria-label="Enviar"
        >
          ➤
        </button>
      </div>
    );
  }

  // --- INPUT_EMAIL: Input com validação visual ---
  if (type === 'INPUT_EMAIL') {
    return (
      <div className="td-chat-input-area">
        <div className="td-chat-input-wrapper">
          <input
            ref={inputRef}
            type="email"
            className={`td-chat-input-field ${error ? 'td-chat-input-field--error' : ''}`}
            placeholder={placeholder}
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(null); }}
            onKeyDown={handleKeyDown}
            autoComplete="email"
          />
          {ErrorMessage}
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
    INPUT_NUMBER: 'number',
    INPUT_DATE: 'date',
  };

  const htmlType = inputTypeMap[type] || 'text';

  // --- Input padrão (text, number, date) ---
  return (
    <div className="td-chat-input-area">
      <div className="td-chat-input-wrapper">
        <input
          ref={inputRef}
          type={htmlType}
          className="td-chat-input-field"
          placeholder={placeholder}
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(null); }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />
        {ErrorMessage}
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
  const typingDelay = formConfig?.settings?.typingDelay ?? 500;

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
      isProcessingRef.current = false;
      setIsTyping(false);
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

        // Só desliga a animação se o próximo bloco não for de digitação
        const willNextBlockType = (currentIndex) => {
          let idx = currentIndex + 1;
          while (idx < blocks.length) {
            const nextBlock = blocks[idx];
            if (nextBlock.type === 'WEBHOOK' || nextBlock.type === 'REDIRECT') {
              idx++;
              continue;
            }
            return true;
          }
          return false;
        };

        timeoutRef.current = setTimeout(() => {
          // TEXT mostra mensagem; WAIT é silencioso.
          if (type === 'TEXT') {
            const primaryText = label || config.message || '...';
            const secondaryText = label && config.message ? config.message : null;

            setMessages((prev) => [...prev, {
              id: `msg-${block.id}`,
              sender: 'bot',
              content: primaryText,
              blockType: type,
            }]);

            if (secondaryText) {
              scrollToBottom();
              // Agenda a segunda mensagem após o typingDelay
              timeoutRef.current = setTimeout(() => {
                setMessages((prev) => [...prev, {
                  id: `msg-${block.id}-extra`,
                  sender: 'bot',
                  content: secondaryText,
                  blockType: type,
                }]);

                if (!willNextBlockType(processingIndex)) {
                  setIsTyping(false);
                }

                isProcessingRef.current = false;
                setProcessingIndex((prev) => prev + 1);
                scrollToBottom();
              }, typingDelay);
              return;
            }
          }

          if (!willNextBlockType(processingIndex)) {
            setIsTyping(false);
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
    const endBlock = [...blocks].reverse().find(b => b.type === 'END_SCREEN');
    const title = endBlock?.label || 'Respostas enviadas!';
    const message = endBlock?.config?.message || 'Obrigado por completar o formulário.';

    return (
      <div className="td-chat-container" style={{ '--td-accent': accentColor }}>
        <div className="td-chat-completed">
          <div className="td-chat-completed-icon">✓</div>
          <h2>{title}</h2>
          <p>{message}</p>
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
