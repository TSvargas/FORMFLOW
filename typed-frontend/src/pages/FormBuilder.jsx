// =============================================================================
// TypeD V2 — Form Builder
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  getFormDetails, 
  createBlock, 
  updateBlock, 
  deleteBlock, 
  reorderBlocks,
  updateForm,
  publishForm,
  unpublishForm,
  discardDraft
} from '../lib/api.js';

const WORKSPACE_ID = "ws-mock-123";

// Block Types disponíveis para adicionar
const AVAILABLE_BLOCKS = [
  { type: 'TEXT', label: 'Mensagem (Texto)' },
  { type: 'INPUT_TEXT', label: 'Texto Curto' },
  { type: 'INPUT_EMAIL', label: 'Email' },
  { type: 'INPUT_PHONE', label: 'Telefone' },
  { type: 'INPUT_TEXTAREA', label: 'Texto Longo' },
  { type: 'INPUT_SELECT', label: 'Múltipla Escolha' },
  { type: 'END_SCREEN', label: 'Ecrã Final' },
  { type: 'WAIT', label: 'Atraso (Tempo)' },
];

export default function FormBuilder() {
  const { formId } = useParams();
  const navigate = useNavigate();

  const [form, setForm] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [selectedBlockId, setSelectedBlockId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [webhookSaved, setWebhookSaved] = useState(false);

  // Debounce ref para auto-save
  const debounceTimerRef = useState(null);

  useEffect(() => {
    loadForm();
  }, [formId]);

  async function loadForm() {
    setLoading(true);
    try {
      const data = await getFormDetails(WORKSPACE_ID, formId);
      setForm(data);
      setBlocks(data.blocks || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ===========================================================================
  // AÇÕES DE BLOCOS
  // ===========================================================================

  async function handleAddBlock(type) {
    setIsSaving(true);
    try {
      const isSelect = type === 'INPUT_SELECT' || type === 'INPUT_BUTTONS';
      const isWait = type === 'WAIT';
      const isInput = type.startsWith('INPUT_');
      
      let initialConfig = isSelect ? { options: ['Opção 1', 'Opção 2'] } : (isWait ? { duration: 1200 } : { placeholder: 'Digite aqui...' });
      if (isInput) {
        initialConfig.variableName = type.toLowerCase().replace('input_', '') + '_' + Math.floor(Math.random() * 1000);
      }

      const newBlock = await createBlock(WORKSPACE_ID, formId, {
        type,
        label: isWait ? 'Tempo de Espera' : (isInput ? 'Nova Pergunta' : 'Nova Mensagem'),
        config: initialConfig,
        required: isInput
      });
      
      const updatedBlocks = [...blocks, newBlock];
      setBlocks(updatedBlocks);
      setSelectedBlockId(newBlock.id);
      setForm(prev => ({ ...prev, hasUnpublishedChanges: true }));
    } catch (err) {
      alert(`Erro ao adicionar bloco: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteBlock(blockId) {
    if (!window.confirm('Tem a certeza que deseja eliminar este bloco?')) return;
    
    setIsSaving(true);
    try {
      await deleteBlock(WORKSPACE_ID, formId, blockId);
      setBlocks(blocks.filter(b => b.id !== blockId));
      if (selectedBlockId === blockId) setSelectedBlockId(null);
      setForm(prev => ({ ...prev, hasUnpublishedChanges: true }));
    } catch (err) {
      alert(`Erro ao eliminar: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  }

  // Mover bloco para cima ou para baixo
  async function handleMoveBlock(index, direction) {
    if (
      (direction === 'up' && index === 0) || 
      (direction === 'down' && index === blocks.length - 1)
    ) return;

    const newBlocks = [...blocks];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    
    // Troca
    const temp = newBlocks[index];
    newBlocks[index] = newBlocks[swapIndex];
    newBlocks[swapIndex] = temp;

    // Atualiza localmente primeiro para UI rápida
    setBlocks(newBlocks);

    // Envia ordem para API
    setIsSaving(true);
    try {
      const orderedIds = newBlocks.map(b => b.id);
      const reordered = await reorderBlocks(WORKSPACE_ID, formId, orderedIds);
      setBlocks(reordered); // Sincroniza com DB (garante ordem exata)
      setForm(prev => ({ ...prev, hasUnpublishedChanges: true }));
    } catch (err) {
      alert(`Erro ao reordenar: ${err.message}`);
      loadForm(); // Reverte em caso de erro
    } finally {
      setIsSaving(false);
    }
  }

  // Atualização em tempo real do estado local (Auto-save)
  function handleBlockUpdateLocally(blockId, field, value) {
    setBlocks(prev => prev.map(b => {
      if (b.id !== blockId) return b;
      
      const updated = { ...b };
      if (field.startsWith('config.')) {
        const configKey = field.split('.')[1];
        updated.config = { ...updated.config, [configKey]: value };
      } else {
        updated[field] = value;
      }
      return updated;
    }));
  }

  // Chama a API quando tira o foco (OnBlur)
  async function handleSaveBlock(block) {
    setIsSaving(true);
    try {
      await updateBlock(WORKSPACE_ID, formId, block.id, {
        label: block.label,
        config: block.config,
        required: block.required,
      });
      setForm(prev => ({ ...prev, hasUnpublishedChanges: true }));
      // Pequeno delay artificial para dar feedback visual de sucesso
      await new Promise(r => setTimeout(r, 600));
    } catch (err) {
      alert(`Erro ao salvar: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveFormSettings() {
    setIsSaving(true);
    try {
      await updateForm(WORKSPACE_ID, formId, {
        settings: form.settings
      });
      setWebhookSaved(true);
      setTimeout(() => setWebhookSaved(false), 2000);
    } catch (err) {
      alert(`Erro ao salvar configurações do formulário: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  }

  // ===========================================================================
  // AÇÕES DO FORMULÁRIO
  // ===========================================================================

  async function handlePublish() {
    setIsSaving(true);
    try {
      const updated = await publishForm(WORKSPACE_ID, formId);
      setForm(updated);
      setBlocks(updated.blocks || []);
    } catch (err) {
      alert(`Erro ao publicar: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUnpublish() {
    if (!window.confirm('Ao despublicar, o link público ficará indisponível para os leads. Continuar?')) return;
    setIsSaving(true);
    try {
      const updated = await unpublishForm(WORKSPACE_ID, formId);
      setForm(updated);
      setBlocks(updated.blocks || []);
    } catch (err) {
      alert(`Erro ao despublicar: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDiscard() {
    if (!window.confirm(
      'Descartar todas as alterações de rascunho e restaurar a versão em produção?\n\n' +
      'Esta ação é irreversível para as alterações não publicadas.'
    )) return;
    setIsSaving(true);
    try {
      const restored = await discardDraft(WORKSPACE_ID, formId);
      setForm(restored);
      setBlocks(restored.blocks || []);
      setSelectedBlockId(null);
    } catch (err) {
      alert(`Erro ao descartar rascunho: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  }

  // ===========================================================================
  // RENDERIZAÇÃO
  // ===========================================================================

  if (loading) return <div style={styles.centerMessage}>Carregando builder...</div>;
  if (error) return <div style={styles.centerMessage}>Erro: {error}</div>;

  const selectedBlock = blocks.find(b => b.id === selectedBlockId);
  const publicUrl = `${window.location.origin}/f/${form?.slug}`;

  return (
    <div style={styles.container}>
      {/* HEADER */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <button style={styles.backButton} onClick={() => navigate('/admin')}>
            ← Voltar
          </button>
          <div>
            <h1 style={styles.title}>{form?.name}</h1>
            <p style={styles.subtitle}>/f/{form?.slug} • {form?.displayMode}</p>
          </div>
        </div>
        <div style={{display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap'}}>
          {/* STATUS BADGE */}
          {form?.isPublished && !form?.hasUnpublishedChanges && (
            <span style={styles.statusBadgeOk}>✓ Produção atualizada</span>
          )}
          {form?.isPublished && form?.hasUnpublishedChanges && (
            <span style={styles.statusBadgeDraft}>● Rascunho pendente</span>
          )}
          {!form?.isPublished && (
            <span style={styles.statusBadgeOffline}>○ Offline</span>
          )}

          {/* SHARE LINK (só quando publicado) */}
          {form?.isPublished && (
            <div style={styles.shareContainer}>
              <span style={styles.shareLabel}>Link público:</span>
              <input 
                type="text" 
                readOnly 
                value={publicUrl} 
                onClick={(e) => e.target.select()}
                style={styles.shareInput}
              />
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(publicUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                style={{
                  ...styles.copyBtn,
                  backgroundColor: copied ? '#16a34a' : '#fff',
                  color: copied ? '#fff' : '#475569',
                  borderColor: copied ? '#16a34a' : '#cbd5e1',
                }}
              >
                {copied ? 'Copiado! ✓' : 'Copiar'}
              </button>
            </div>
          )}

          {/* AÇÕES DE PUBLICAÇÃO */}
          {form?.hasUnpublishedChanges && (
            <>
              <button 
                style={styles.publishBtn}
                onClick={handlePublish}
                disabled={isSaving}
              >
                Publicar Alterações
              </button>
              {form?.publishedBlocks && (
                <button 
                  style={styles.discardBtn}
                  onClick={handleDiscard}
                  disabled={isSaving}
                >
                  Descartar Rascunho
                </button>
              )}
            </>
          )}
          {!form?.hasUnpublishedChanges && !form?.isPublished && (
            <button 
              style={styles.publishBtn}
              onClick={handlePublish}
              disabled={isSaving}
            >
              Publicar Formulário
            </button>
          )}
          {form?.isPublished && (
            <button 
              style={styles.unpublishBtn}
              onClick={handleUnpublish}
              disabled={isSaving}
            >
              Despublicar
            </button>
          )}

          <a 
            href={`/f/${form?.slug}?preview=true`} 
            target="_blank" 
            rel="noreferrer"
            style={styles.primaryButton}
          >
            Pré-visualizar
          </a>
        </div>
      </header>

      <div style={styles.layout}>
        {/* BARRA ESQUERDA: Adicionar Blocos */}
        <aside style={styles.leftSidebar}>
          <h3 style={styles.sidebarTitle}>Adicionar Bloco</h3>
          <div style={styles.blockList}>
            {AVAILABLE_BLOCKS.map(b => (
              <button 
                key={b.type} 
                style={styles.addBlockBtn}
                onClick={() => handleAddBlock(b.type)}
                disabled={isSaving}
              >
                + {b.label}
              </button>
            ))}
          </div>

          <div style={{ marginTop: '2.5rem' }}>
            <h3 style={styles.sidebarTitle}>Configurações do Formulário</h3>
            
            <div style={styles.formGroup}>
              <label style={styles.label}>URL de Integração (Webhook / n8n)</label>
              <input 
                type="text"
                value={form?.settings?.webhookUrl || ''}
                onChange={(e) => setForm(prev => ({
                  ...prev,
                  settings: { ...prev.settings, webhookUrl: e.target.value }
                }))}
                onBlur={handleSaveFormSettings}
                style={{
                  ...styles.input,
                  borderColor: webhookSaved ? '#16a34a' : '#cbd5e1'
                }}
                placeholder="https://n8n.meusite.com/webhook/..."
              />
              {webhookSaved && (
                <p style={{fontSize: '0.75rem', color: '#16a34a', marginTop: '0.25rem'}}>
                  ✓ Salvo com sucesso!
                </p>
              )}
              <p style={{fontSize: '0.75rem', color: '#666', marginTop: '0.25rem'}}>
                Enviaremos um POST para esta URL a cada submissão concluída.
              </p>
            </div>
          </div>
        </aside>

        {/* ÁREA CENTRAL: Fluxo do Formulário */}
        <main style={styles.mainContent}>
          <div style={styles.flowContainer}>
            {blocks.length === 0 ? (
              <div style={styles.emptyFlow}>
                <p>Nenhum bloco adicionado. Comece por adicionar um bloco na barra lateral.</p>
              </div>
            ) : (
              blocks.map((block, index) => (
                <div 
                  key={block.id} 
                  style={{
                    ...styles.flowBlock, 
                    ...(selectedBlockId === block.id ? styles.flowBlockActive : {})
                  }}
                  onClick={() => setSelectedBlockId(block.id)}
                >
                  <div style={styles.flowBlockHeader}>
                    <span style={styles.blockTypeBadge}>{block.type}</span>
                    <div style={styles.blockActions}>
                      <button 
                        style={styles.iconBtn} 
                        onClick={(e) => { e.stopPropagation(); handleMoveBlock(index, 'up'); }}
                        disabled={index === 0}
                        title="Subir"
                      >▲</button>
                      <button 
                        style={styles.iconBtn} 
                        onClick={(e) => { e.stopPropagation(); handleMoveBlock(index, 'down'); }}
                        disabled={index === blocks.length - 1}
                        title="Descer"
                      >▼</button>
                      <button 
                        style={{...styles.iconBtn, color: '#dc2626'}} 
                        onClick={(e) => { e.stopPropagation(); handleDeleteBlock(block.id); }}
                        title="Eliminar"
                      >✕</button>
                    </div>
                  </div>
                  <div style={styles.flowBlockContent}>
                    <strong>{block.label || '(Sem texto)'}</strong>
                  </div>
                </div>
              ))
            )}
            {isSaving && <div style={styles.savingIndicator}>A guardar alterações...</div>}
          </div>
        </main>

        {/* BARRA DIREITA: Configurações do Bloco Selecionado */}
        <aside style={styles.rightSidebar}>
          {selectedBlock ? (
            <div style={styles.settingsPanel}>
              <h3 style={styles.sidebarTitle}>Configurações do Bloco</h3>
              <p style={{fontSize: '0.8rem', color: '#666', marginBottom: '1.5rem'}}>
                Tipo: <strong>{selectedBlock.type}</strong>
              </p>

              {selectedBlock.type !== 'WAIT' && (
                <div style={styles.formGroup}>
                  <label style={styles.label}>Título / Pergunta</label>
                  <textarea 
                    value={selectedBlock.label || ''}
                    onChange={(e) => handleBlockUpdateLocally(selectedBlock.id, 'label', e.target.value)}
                    onBlur={() => handleSaveBlock(selectedBlock)}
                    style={styles.textarea}
                    rows={3}
                  />
                </div>
              )}

              {selectedBlock.type.startsWith('INPUT_') && (
                <div style={styles.formGroup}>
                  <label style={styles.label}>ID Interno da Variável (para Webhooks)</label>
                  <input 
                    type="text"
                    value={selectedBlock.config?.variableName || ''}
                    onChange={(e) => {
                      const safeValue = e.target.value.replace(/[^a-zA-Z0-9_]/g, '');
                      handleBlockUpdateLocally(selectedBlock.id, 'config.variableName', safeValue);
                    }}
                    onBlur={() => handleSaveBlock(selectedBlock)}
                    style={styles.input}
                    placeholder="Ex: email_lead"
                  />
                  <p style={{fontSize: '0.75rem', color: '#666', marginTop: '0.25rem'}}>Usado como chave do JSON em integrações. Sem espaços.</p>
                </div>
              )}

              {selectedBlock.type === 'WAIT' && (
                <div style={styles.formGroup}>
                  <label style={styles.label}>Tempo de Atraso (milissegundos)</label>
                  <input 
                    type="number"
                    value={selectedBlock.config?.duration ?? 1200}
                    onChange={(e) => handleBlockUpdateLocally(selectedBlock.id, 'config.duration', Number(e.target.value))}
                    onBlur={() => handleSaveBlock(selectedBlock)}
                    style={styles.input}
                    min="0"
                    step="100"
                    placeholder="Ex: 1200"
                  />
                  <p style={{fontSize: '0.8rem', color: '#666', marginTop: '0.5rem'}}>
                    1000 milissegundos = 1 segundo.
                  </p>
                </div>
              )}

              {selectedBlock.type.startsWith('INPUT_') && selectedBlock.type !== 'INPUT_BUTTONS' && selectedBlock.type !== 'INPUT_SELECT' && (
                <div style={styles.formGroup}>
                  <label style={styles.label}>Placeholder</label>
                  <input 
                    type="text"
                    value={selectedBlock.config?.placeholder || ''}
                    onChange={(e) => handleBlockUpdateLocally(selectedBlock.id, 'config.placeholder', e.target.value)}
                    onBlur={() => handleSaveBlock(selectedBlock)}
                    style={styles.input}
                  />
                </div>
              )}

              {['TEXT', 'END_SCREEN'].includes(selectedBlock.type) && (
                <div style={styles.formGroup}>
                  <label style={styles.label}>Mensagem Adicional</label>
                  <input 
                    type="text"
                    value={selectedBlock.config?.message || ''}
                    onChange={(e) => handleBlockUpdateLocally(selectedBlock.id, 'config.message', e.target.value)}
                    onBlur={() => handleSaveBlock(selectedBlock)}
                    style={styles.input}
                  />
                </div>
              )}

              {selectedBlock.type.startsWith('INPUT_') && (
                <div style={styles.formGroup}>
                  <label style={{...styles.label, display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                    <input 
                      type="checkbox"
                      checked={selectedBlock.required}
                      onChange={(e) => {
                        handleBlockUpdateLocally(selectedBlock.id, 'required', e.target.checked);
                        handleSaveBlock({ ...selectedBlock, required: e.target.checked });
                      }}
                    />
                    Resposta Obrigatória
                  </label>
                </div>
              )}

              {(selectedBlock.type === 'INPUT_BUTTONS' || selectedBlock.type === 'INPUT_SELECT') && (
                <div style={styles.formGroup}>
                  <label style={styles.label}>Opções de Resposta</label>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    {(selectedBlock.config?.options || []).map((opt, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <input 
                          type="text"
                          value={opt}
                          placeholder={`Opção ${idx + 1}`}
                          onChange={(e) => {
                            const newOptions = [...(selectedBlock.config?.options || [])];
                            newOptions[idx] = e.target.value;
                            handleBlockUpdateLocally(selectedBlock.id, 'config.options', newOptions);
                          }}
                          onBlur={() => handleSaveBlock(selectedBlock)}
                          style={{ ...styles.input, flex: 1, marginBottom: 0 }}
                        />
                        <button
                          onClick={() => {
                            const newOptions = [...(selectedBlock.config?.options || [])];
                            newOptions.splice(idx, 1);
                            handleBlockUpdateLocally(selectedBlock.id, 'config.options', newOptions);
                            handleSaveBlock({
                              ...selectedBlock,
                              config: { ...selectedBlock.config, options: newOptions }
                            });
                          }}
                          style={{
                            ...styles.iconBtn,
                            color: '#dc2626',
                            padding: '0.5rem',
                            backgroundColor: '#fee2e2',
                            borderRadius: '6px'
                          }}
                          title="Remover Opção"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => {
                      const newOptions = [...(selectedBlock.config?.options || []), `Opção ${(selectedBlock.config?.options?.length || 0) + 1}`];
                      handleBlockUpdateLocally(selectedBlock.id, 'config.options', newOptions);
                      handleSaveBlock({
                        ...selectedBlock,
                        config: { ...selectedBlock.config, options: newOptions }
                      });
                    }}
                    style={{
                      backgroundColor: '#f1f5f9',
                      border: '1px dashed #cbd5e1',
                      color: '#475569',
                      padding: '0.5rem',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      width: '100%',
                      fontWeight: '500',
                      transition: 'background-color 0.2s',
                    }}
                    onMouseEnter={(e) => e.target.style.backgroundColor = '#e2e8f0'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = '#f1f5f9'}
                  >
                    + Adicionar Opção
                  </button>
                </div>
              )}
              
              <div style={{marginTop: '2rem', fontSize: '0.8rem', color: '#888'}}>
                As alterações são salvas automaticamente ao clicar fora do campo.
              </div>
            </div>
          ) : (
            <div style={styles.emptySettings}>
              Selecione um bloco no fluxo para editar as suas configurações.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

// =============================================================================
// Estilos Inline
// =============================================================================
const styles = {
  container: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'system-ui, sans-serif',
    color: '#1a1a2e',
    backgroundColor: '#f8f9fa',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem 2rem',
    backgroundColor: '#fff',
    borderBottom: '1px solid #eaeaea',
    flexShrink: 0,
    zIndex: 10,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.5rem',
  },
  title: {
    margin: 0,
    fontSize: '1.2rem',
    fontWeight: '600',
  },
  subtitle: {
    margin: 0,
    fontSize: '0.85rem',
    color: '#666',
  },
  backButton: {
    background: 'none',
    border: '1px solid #ddd',
    padding: '0.5rem 1rem',
    borderRadius: '6px',
    cursor: 'pointer',
    color: '#555',
  },
  primaryButton: {
    backgroundColor: '#6C63FF',
    color: '#fff',
    border: 'none',
    padding: '0.6rem 1.2rem',
    borderRadius: '6px',
    fontWeight: '500',
    cursor: 'pointer',
    textDecoration: 'none',
    fontSize: '0.9rem',
  },
  draftBtn: {
    backgroundColor: '#fff',
    color: '#d97706',
    border: '1px solid #d97706',
    padding: '0.6rem 1.2rem',
    borderRadius: '6px',
    fontWeight: '500',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
  publishedBtn: {
    backgroundColor: '#16a34a',
    color: '#fff',
    border: 'none',
    padding: '0.6rem 1.2rem',
    borderRadius: '6px',
    fontWeight: '500',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
  publishBtn: {
    backgroundColor: '#16a34a',
    color: '#fff',
    border: 'none',
    padding: '0.5rem 1rem',
    borderRadius: '6px',
    fontWeight: '600',
    cursor: 'pointer',
    fontSize: '0.85rem',
    boxShadow: '0 2px 8px rgba(22,163,74,0.3)',
    transition: 'opacity 0.2s',
  },
  unpublishBtn: {
    backgroundColor: 'transparent',
    color: '#94a3b8',
    border: '1px solid #cbd5e1',
    padding: '0.5rem 1rem',
    borderRadius: '6px',
    fontWeight: '500',
    cursor: 'pointer',
    fontSize: '0.8rem',
    transition: 'all 0.2s',
  },
  discardBtn: {
    backgroundColor: 'transparent',
    color: '#ef4444',
    border: '1px solid #fecaca',
    padding: '0.5rem 1rem',
    borderRadius: '6px',
    fontWeight: '500',
    cursor: 'pointer',
    fontSize: '0.8rem',
    transition: 'all 0.2s',
  },
  statusBadgeOk: {
    fontSize: '0.75rem',
    fontWeight: '600',
    color: '#16a34a',
    backgroundColor: '#f0fdf4',
    padding: '0.3rem 0.7rem',
    borderRadius: '20px',
    border: '1px solid #bbf7d0',
  },
  statusBadgeDraft: {
    fontSize: '0.75rem',
    fontWeight: '600',
    color: '#d97706',
    backgroundColor: '#fffbeb',
    padding: '0.3rem 0.7rem',
    borderRadius: '20px',
    border: '1px solid #fde68a',
  },
  statusBadgeOffline: {
    fontSize: '0.75rem',
    fontWeight: '600',
    color: '#64748b',
    backgroundColor: '#f1f5f9',
    padding: '0.3rem 0.7rem',
    borderRadius: '20px',
    border: '1px solid #cbd5e1',
  },
  layout: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  leftSidebar: {
    width: '260px',
    backgroundColor: '#fff',
    borderRight: '1px solid #eaeaea',
    padding: '1.5rem',
    overflowY: 'auto',
  },
  rightSidebar: {
    width: '320px',
    backgroundColor: '#fff',
    borderLeft: '1px solid #eaeaea',
    padding: '0',
    overflowY: 'auto',
  },
  mainContent: {
    flex: 1,
    overflowY: 'auto',
    padding: '2rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  sidebarTitle: {
    margin: '0 0 1.25rem 0',
    fontSize: '1rem',
    fontWeight: '600',
    textTransform: 'uppercase',
    color: '#888',
    letterSpacing: '0.05em',
  },
  blockList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  addBlockBtn: {
    textAlign: 'left',
    padding: '0.75rem 1rem',
    backgroundColor: '#f8f9fa',
    border: '1px solid #eaeaea',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: '500',
    color: '#444',
    transition: 'border-color 0.2s',
  },
  flowContainer: {
    width: '100%',
    maxWidth: '500px',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    paddingBottom: '4rem',
  },
  flowBlock: {
    backgroundColor: '#fff',
    border: '2px solid transparent',
    borderRadius: '12px',
    padding: '1.25rem',
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
    cursor: 'pointer',
    transition: 'border-color 0.2s, transform 0.1s',
  },
  flowBlockActive: {
    borderColor: '#6C63FF',
  },
  flowBlockHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
  },
  blockTypeBadge: {
    fontSize: '0.7rem',
    backgroundColor: '#eef2ff',
    color: '#4f46e5',
    padding: '0.2rem 0.5rem',
    borderRadius: '4px',
    fontWeight: '600',
  },
  blockActions: {
    display: 'flex',
    gap: '0.25rem',
  },
  iconBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '0.25rem',
    color: '#888',
    borderRadius: '4px',
  },
  flowBlockContent: {
    fontSize: '1rem',
    color: '#333',
  },
  emptyFlow: {
    textAlign: 'center',
    padding: '3rem',
    color: '#888',
    backgroundColor: '#fff',
    borderRadius: '12px',
    border: '2px dashed #ccc',
  },
  settingsPanel: {
    padding: '1.5rem',
  },
  emptySettings: {
    padding: '3rem 1.5rem',
    textAlign: 'center',
    color: '#888',
  },
  formGroup: {
    marginBottom: '1.25rem',
  },
  label: {
    display: 'block',
    marginBottom: '0.5rem',
    fontWeight: '500',
    fontSize: '0.9rem',
    color: '#444',
  },
  input: {
    width: '100%',
    padding: '0.75rem',
    border: '1px solid #ccc',
    borderRadius: '6px',
    fontSize: '0.95rem',
    boxSizing: 'border-box',
  },
  textarea: {
    width: '100%',
    padding: '0.75rem',
    border: '1px solid #ccc',
    borderRadius: '6px',
    fontSize: '0.95rem',
    boxSizing: 'border-box',
    resize: 'vertical',
  },
  savingIndicator: {
    position: 'fixed',
    bottom: '1rem',
    right: '1rem',
    backgroundColor: '#1a1a2e',
    color: '#fff',
    padding: '0.5rem 1rem',
    borderRadius: '20px',
    fontSize: '0.8rem',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  },
  centerMessage: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    color: '#666',
  },
  shareContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    backgroundColor: '#f1f5f9',
    padding: '0.4rem 0.8rem',
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
  },
  shareLabel: {
    fontSize: '0.8rem',
    color: '#475569',
    fontWeight: '500',
  },
  shareInput: {
    border: 'none',
    background: 'transparent',
    fontSize: '0.85rem',
    color: '#0f172a',
    width: '180px',
    outline: 'none',
    cursor: 'pointer',
  },
  copyBtn: {
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    padding: '0.3rem 0.6rem',
    fontSize: '0.75rem',
    cursor: 'pointer',
    fontWeight: '500',
    transition: 'all 0.2s ease',
  },
};
