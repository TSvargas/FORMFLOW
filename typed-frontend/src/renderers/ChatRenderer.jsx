import { useState, useEffect, useRef, useCallback } from 'react';
import { useFormEngine } from '../context/FormEngineProvider.jsx';
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { validateInput } from '../lib/validation.js';
import './ChatRenderer.css';

function formatCPF(value) {
  const v = value.replace(/\D/g, '').slice(0, 11);
  if (v.length <= 3) return v;
  if (v.length <= 6) return `${v.slice(0, 3)}.${v.slice(3)}`;
  if (v.length <= 9) return `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6)}`;
  return `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6, 9)}-${v.slice(9)}`;
}

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

  // --- INPUT_CPF ---
  if (type === 'INPUT_CPF') {
    return (
      <div className="td-chat-input-area">
        <div className="td-chat-input-wrapper">
          <input
            ref={inputRef}
            type="text"
            className={`td-chat-input-field ${error ? 'td-chat-input-field--error' : ''}`}
            placeholder={placeholder || '000.000.000-00'}
            value={value}
            onChange={(e) => { setValue(formatCPF(e.target.value)); setError(null); }}
            onKeyDown={handleKeyDown}
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

  // --- REDIRECT ---
  if (type === 'REDIRECT') {
    return (
      <div className="td-chat-input-area">
        <div className="td-chat-input-wrapper">
          <button
            className="td-chat-option-btn"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => {
              if (config.url) {
                window.open(config.url, '_blank');
              }
              onSubmit('Redirecionado');
            }}
            type="button"
          >
            {config.buttonText || 'Acessar Link'}
          </button>
        </div>
      </div>
    );
  }

  // --- INPUT_RATING ---
  if (type === 'INPUT_RATING') {
    const maxScore = config.maxScore || 5;
    const options = Array.from({ length: maxScore === 10 ? 11 : maxScore }, (_, i) => maxScore === 10 ? i : i + 1);

    return (
      <div className="td-chat-input-area">
        <div className="td-chat-input-wrapper">
          <div className="td-chat-options" style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
            {options.map((score) => (
              <button
                key={`${block.id}-rating-${score}`}
                className="td-chat-option-btn"
                style={{ flex: 'none', padding: maxScore === 10 ? '0.5rem 0.8rem' : '0.5rem', minWidth: '40px', textAlign: 'center' }}
                onClick={() => onSubmit(score)}
                type="button"
              >
                {maxScore === 5 ? '⭐' : score}
              </button>
            ))}
          </div>
        </div>
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

function isInlineInteractive(block) {
  if (!block) return false;
  const { type, config = {} } = block;
  if (['INPUT_BUTTONS', 'INPUT_SELECT', 'INPUT_RATING', 'REDIRECT'].includes(type)) return true;
  if (type === 'INPUT_DATE' && (config.calendarProvider === 'Calendly' || config.calendarProvider === 'Cal.com')) return true;
  return false;
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
      <div style={{ padding: '2rem', textAlign: 'center', color: '#888', backgroundColor: '#f8f9fa', borderRadius: '12px' }}>
        <p>URL de agendamento não configurada.</p>
        <button className="td-chat-option-btn" onClick={() => onSubmit('Sem resposta')} type="button" style={{marginTop: '1rem'}}>
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
// SUB-COMPONENTE: InlineInteractiveInput
// =============================================================================
function InlineInteractiveInput({ block, onSubmit }) {
  if (!block) return null;
  const { type, config = {} } = block;

  if (type === 'INPUT_BUTTONS' || type === 'INPUT_SELECT') {
    const options = config.options || config.buttons || [];
    if (options.length === 0) {
      return (
        <div className="td-chat-inline-options">
          <button className="td-chat-inline-btn" onClick={() => onSubmit('Sem resposta')} type="button">
            Avançar
          </button>
        </div>
      );
    }
    return (
      <div className="td-chat-inline-options">
        {options.map((opt, i) => {
          const label = typeof opt === 'string' ? opt : opt.label;
          const val = typeof opt === 'string' ? opt : (opt.value || opt.label);
          return (
            <button
              key={`${block.id}-opt-${i}`}
              className="td-chat-inline-btn"
              onClick={() => onSubmit(val)}
              type="button"
            >
              <span>{label}</span>
              <span className="td-chat-inline-btn-arrow">→</span>
            </button>
          );
        })}
      </div>
    );
  }

  if (type === 'INPUT_RATING') {
    const maxScore = config.maxScore || 5;
    const options = Array.from({ length: maxScore === 10 ? 11 : maxScore }, (_, i) => maxScore === 10 ? i : i + 1);
    return (
      <div className="td-chat-inline-options td-chat-inline-options--row">
        {options.map((score) => (
          <button
            key={`${block.id}-rating-${score}`}
            className="td-chat-inline-btn"
            style={{ padding: maxScore === 10 ? '0.5rem 0.8rem' : '0.5rem', minWidth: '40px', textAlign: 'center', width: 'auto', display: 'inline-block', justifyContent: 'center' }}
            onClick={() => onSubmit(score)}
            type="button"
          >
            {maxScore === 5 ? '⭐' : score}
          </button>
        ))}
      </div>
    );
  }

  if (type === 'REDIRECT') {
    return (
      <div className="td-chat-inline-options">
        <button
          className="td-chat-inline-btn"
          onClick={() => {
            if (config.url) window.open(config.url, '_blank');
            onSubmit('Redirecionado');
          }}
          type="button"
        >
          <span>{config.buttonText || 'Acessar Link'}</span>
          <span className="td-chat-inline-btn-arrow">→</span>
        </button>
      </div>
    );
  }

  if (type === 'INPUT_DATE' && (config.calendarProvider === 'Calendly' || config.calendarProvider === 'Cal.com')) {
    return (
      <div className="td-chat-inline-options" style={{ width: '100%', padding: '0' }}>
        <IframeCalendarInput block={block} onSubmit={onSubmit} />
      </div>
    );
  }

  return null;
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
  // BRANDING: Aplicar variáveis CSS dinâmicas do branding
  // -------------------------------------------------------------------------
  const branding = formConfig?.branding || {};
  const accentColor = branding.primaryColor || '#6C63FF';
  const textColor = branding.textColor || '#1a1a2e';
  const secondaryColor = branding.secondaryColor || '#ffffff';
  const fontFamily = branding.fontFamily || '';
  const avatarUrl = branding.avatarUrl || '';
  const API_BASE = import.meta.env.VITE_API_URL || '';

  const brandingVars = {
    '--td-accent': accentColor,
    '--td-text': textColor,
    '--td-secondary': secondaryColor,
    ...(fontFamily ? { '--td-font': `"${fontFamily}", sans-serif` } : {}),
  };

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
      if (type === 'WEBHOOK') {
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
            if (nextBlock.type === 'WEBHOOK') {
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
      if (type.startsWith('INPUT_') || type === 'REDIRECT') {
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
      <div className="td-chat-loading" style={brandingVars}>
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
      <div className="td-chat-container" style={brandingVars}>
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
    <div className="td-chat-container" style={brandingVars}>
      {/* Header */}
      <div className="td-chat-header">
        <div className="td-chat-header-avatar">
          {avatarUrl ? (
            <img src={avatarUrl.startsWith('/') ? `${API_BASE}${avatarUrl}` : avatarUrl} alt={formConfig?.name || 'Bot'} />
          ) : (
            headerInitial
          )}
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

        {/* --- INLINE INTERACTIVE INPUTS --- */}
        {waitingForInput && currentInputBlock && isInlineInteractive(currentInputBlock) && (
          <InlineInteractiveInput block={currentInputBlock} onSubmit={handleUserSubmit} />
        )}

        {/* Scroll anchor */}
        <div ref={messagesEndRef} style={{ height: 1, flexShrink: 0 }} />
      </div>

      {/* Input — só aparece quando esperando resposta do utilizador e NÃO é inline */}
      {waitingForInput && currentInputBlock && !isInlineInteractive(currentInputBlock) && (
        <BlockInput
          block={currentInputBlock}
          onSubmit={handleUserSubmit}
        />
      )}
    </div>
  );
}
