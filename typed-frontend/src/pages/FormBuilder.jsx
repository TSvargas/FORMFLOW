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
  updateForm
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
      const newBlock = await createBlock(WORKSPACE_ID, formId, {
        type,
        label: type.startsWith('INPUT_') ? 'Nova Pergunta' : 'Nova Mensagem',
        config: isSelect ? { options: ['Opção 1', 'Opção 2'] } : { placeholder: 'Digite aqui...' },
        required: type !== 'TEXT' && type !== 'END_SCREEN'
      });
      
      const updatedBlocks = [...blocks, newBlock];
      setBlocks(updatedBlocks);
      setSelectedBlockId(newBlock.id);
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
      // Pequeno delay artificial para dar feedback visual de sucesso
      await new Promise(r => setTimeout(r, 600));
    } catch (err) {
      alert(`Erro ao salvar: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  }

  // ===========================================================================
  // AÇÕES DO FORMULÁRIO
  // ===========================================================================

  async function handleTogglePublish() {
    setIsSaving(true);
    try {
      const updated = await updateForm(WORKSPACE_ID, formId, { isPublished: !form.isPublished });
      setForm(prev => ({ ...prev, isPublished: updated.isPublished }));
    } catch (err) {
      alert(`Erro ao alterar estado: ${err.message}`);
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
        <div style={{display: 'flex', gap: '1rem', alignItems: 'center'}}>
          <button 
            style={form?.isPublished ? styles.publishedBtn : styles.draftBtn}
            onClick={handleTogglePublish}
            disabled={isSaving}
          >
            {form?.isPublished ? 'Despublicar' : 'Publicar Formulário'}
          </button>
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

              {['TEXT', 'WAIT', 'END_SCREEN'].includes(selectedBlock.type) && (
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
                  <label style={styles.label}>Opções (Separadas por vírgula)</label>
                  <input 
                    type="text"
                    value={(selectedBlock.config?.options || []).join(', ')}
                    onChange={(e) => {
                      const opts = e.target.value.split(',').map(s => s.trim()).filter(s => s);
                      handleBlockUpdateLocally(selectedBlock.id, 'config.options', opts);
                    }}
                    onBlur={() => handleSaveBlock(selectedBlock)}
                    style={styles.input}
                    placeholder="Opção A, Opção B"
                  />
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
  }
};
