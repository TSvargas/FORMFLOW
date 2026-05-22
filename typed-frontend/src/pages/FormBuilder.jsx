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
  discardDraft,
  uploadFile
} from '../lib/api.js';

const WORKSPACE_ID = "ws-mock-123";

// Block Types disponíveis para adicionar
const AVAILABLE_BLOCKS = [
  { type: 'TEXT', label: 'Mensagem (Texto)' },
  { type: 'INPUT_TEXT', label: 'Texto Curto' },
  { type: 'INPUT_EMAIL', label: 'Email' },
  { type: 'INPUT_PHONE', label: 'Telefone' },
  { type: 'INPUT_CPF', label: 'CPF' },
  { type: 'INPUT_TEXTAREA', label: 'Texto Longo' },
  { type: 'INPUT_SELECT', label: 'Múltipla Escolha' },
  { type: 'INPUT_BUTTONS_SIM_NAO', label: 'Sim/Não' },
  { type: 'INPUT_DATE', label: 'Data/Agendamento' },
  { type: 'INPUT_RATING', label: 'Avaliação' },
  { type: 'REDIRECT', label: 'Link/Redirecionamento' },
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
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  // Drag and Drop
  const [draggedType, setDraggedType] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

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

  async function handleAddBlock(rawType, insertIndex = null) {
    setIsSaving(true);
    try {
      let type = rawType;
      let initialConfig = {};

      if (rawType === 'INPUT_BUTTONS_SIM_NAO') {
        type = 'INPUT_BUTTONS';
        initialConfig = { options: ['Sim', 'Não'] };
      } else if (rawType === 'REDIRECT') {
        initialConfig = { url: 'https://', buttonText: 'Acessar Link' };
      } else if (rawType === 'INPUT_DATE') {
        initialConfig = { calendarProvider: 'native', enableTime: false };
      } else if (rawType === 'INPUT_RATING') {
        initialConfig = { maxScore: 5 };
      } else {
        const isSelect = type === 'INPUT_SELECT' || type === 'INPUT_BUTTONS';
        initialConfig = isSelect ? { options: ['Opção 1', 'Opção 2'] } : (type === 'WAIT' ? { duration: 1200 } : { placeholder: 'Digite aqui...' });
      }

      const isInput = type.startsWith('INPUT_');
      const isWait = type === 'WAIT';

      if (isInput) {
        initialConfig.variableName = type.toLowerCase().replace('input_', '') + '_' + Math.floor(Math.random() * 1000);
      }

      const newBlock = await createBlock(WORKSPACE_ID, formId, {
        type,
        label: isWait ? 'Tempo de Espera' : (isInput ? 'Nova Pergunta' : 'Nova Mensagem'),
        config: initialConfig,
        required: isInput
      });
      
      let updatedBlocks = [...blocks, newBlock];
      
      if (insertIndex !== null && insertIndex < blocks.length) {
        updatedBlocks = [...blocks];
        updatedBlocks.splice(insertIndex, 0, newBlock);
        
        setBlocks(updatedBlocks);
        setSelectedBlockId(newBlock.id);
        
        const orderedIds = updatedBlocks.map(b => b.id);
        const reordered = await reorderBlocks(WORKSPACE_ID, formId, orderedIds);
        setBlocks(reordered);
        setForm(prev => ({ ...prev, hasUnpublishedChanges: true }));
      } else {
        setBlocks(updatedBlocks);
        setSelectedBlockId(newBlock.id);
        setForm(prev => ({ ...prev, hasUnpublishedChanges: true }));
      }
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

  async function handleSaveFormBranding() {
    setIsSaving(true);
    try {
      await updateForm(WORKSPACE_ID, formId, {
        branding: form.branding
      });
      setForm(prev => ({ ...prev, hasUnpublishedChanges: true }));
    } catch (err) {
      alert(`Erro ao salvar branding: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAvatarUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setIsUploadingAvatar(true);
    try {
      const res = await uploadFile(WORKSPACE_ID, file);
      const updatedBranding = { ...(form?.branding || {}), avatarUrl: res.url };
      setForm(prev => ({ ...prev, branding: updatedBranding, hasUnpublishedChanges: true }));
      await updateForm(WORKSPACE_ID, formId, { branding: updatedBranding });
    } catch (err) {
      alert(`Erro no upload do avatar: ${err.message}`);
    } finally {
      setIsUploadingAvatar(false);
    }
  }

  // Helper: Validar hex color
  function isValidHex(hex) {
    return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(hex);
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
            &larr; Voltar
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <h1 style={styles.title}>{form?.name}</h1>
              {/* STATUS BADGE MOVIDO PARA CÁ */}
              {form?.isPublished && !form?.hasUnpublishedChanges && (
                <span style={styles.statusBadgeOk}>✓ Produção atualizada</span>
              )}
              {form?.isPublished && form?.hasUnpublishedChanges && (
                <span style={styles.statusBadgeDraft}>● Rascunho pendente</span>
              )}
              {!form?.isPublished && (
                <span style={styles.statusBadgeOffline}>○ Offline</span>
              )}
            </div>
            <p style={styles.subtitle}>/f/{form?.slug} &bull; {form?.displayMode}</p>
          </div>
        </div>
        <div style={{display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end'}}>

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

          <div style={{ width: '1px', height: '24px', backgroundColor: '#eaeaea', margin: '0 0.25rem' }}></div>

          <a 
            href={`/f/${form?.slug}?preview=true`} 
            target="_blank" 
            rel="noreferrer"
            style={{ ...styles.primaryButton, backgroundColor: '#4f46e5' }}
          >
            Pré-visualizar
          </a>
        </div>
      </header>

      <div style={styles.layout}>
        {/* BARRA ESQUERDA: Adicionar Blocos */}
        <aside style={styles.leftSidebar}>
          <h3 style={styles.sidebarTitle}>Adicionar Bloco</h3>
          <p style={{fontSize: '0.8rem', color: '#666', marginBottom: '1rem', marginTop: '-0.5rem'}}>
            Clique ou arraste para o fluxo.
          </p>
          <div style={styles.blockList}>
            {AVAILABLE_BLOCKS.map(b => (
              <div 
                key={b.type} 
                draggable={!isSaving}
                onDragStart={(e) => {
                  if (isSaving) {
                    e.preventDefault();
                    return;
                  }
                  e.dataTransfer.setData('blockType', b.type);
                  setDraggedType(b.type);
                }}
                onDragEnd={() => setDraggedType(null)}
                style={{
                  ...styles.addBlockBtn,
                  opacity: draggedType === b.type ? 0.5 : (isSaving ? 0.5 : 1),
                  cursor: isSaving ? 'not-allowed' : 'grab',
                  display: 'flex',
                  alignItems: 'center',
                }}
                onClick={() => { if (!isSaving) handleAddBlock(b.type); }}
              >
                <span style={{marginRight: '8px', color: '#ccc', fontSize: '1.2rem', lineHeight: '1'}}>⋮⋮</span>
                {b.label}
              </div>
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
        <main style={styles.mainContent} onClick={() => setSelectedBlockId(null)}>
          <div style={styles.flowContainer}>
            {blocks.length === 0 ? (
              <div 
                style={{...styles.emptyFlow, minHeight: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: dragOverIndex === 0 ? '2px dashed #4f46e5' : '2px dashed #ccc', backgroundColor: dragOverIndex === 0 ? '#eef2ff' : '#fff'}}
                onDragOver={(e) => { e.preventDefault(); setDragOverIndex(0); }}
                onDragLeave={() => setDragOverIndex(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverIndex(null);
                  const type = e.dataTransfer.getData('blockType');
                  if (type) handleAddBlock(type, 0);
                }}
              >
                <p>Nenhum bloco adicionado. Comece por clicar ou arrastar um bloco da barra lateral.</p>
              </div>
            ) : (
              blocks.map((block, index) => (
                <div key={block.id}>
                  {/* Drop zone antes do bloco */}
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOverIndex(index); }}
                    onDragLeave={() => setDragOverIndex(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverIndex(null);
                      const type = e.dataTransfer.getData('blockType');
                      if (type) handleAddBlock(type, index);
                    }}
                    style={{
                      height: dragOverIndex === index ? '40px' : '12px',
                      margin: '-6px 0',
                      borderRadius: '8px',
                      backgroundColor: dragOverIndex === index ? '#eef2ff' : 'transparent',
                      border: dragOverIndex === index ? '2px dashed #4f46e5' : '2px solid transparent',
                      transition: 'all 0.2s',
                      zIndex: 10,
                      position: 'relative',
                    }}
                  />
                  <div 
                    style={{
                      ...styles.flowBlock, 
                      ...(selectedBlockId === block.id ? styles.flowBlockActive : {})
                    }}
                    onClick={(e) => { e.stopPropagation(); setSelectedBlockId(block.id); }}
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
                </div>
              ))
            )}
            
            {/* Drop zone final (apenas se houver blocos) */}
            {blocks.length > 0 && (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOverIndex(blocks.length); }}
                onDragLeave={() => setDragOverIndex(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverIndex(null);
                  const type = e.dataTransfer.getData('blockType');
                  if (type) handleAddBlock(type, blocks.length);
                }}
                style={{
                  height: dragOverIndex === blocks.length ? '40px' : '24px',
                  marginTop: '0.5rem',
                  borderRadius: '8px',
                  backgroundColor: dragOverIndex === blocks.length ? '#eef2ff' : 'transparent',
                  border: dragOverIndex === blocks.length ? '2px dashed #4f46e5' : '2px solid transparent',
                  transition: 'all 0.2s',
                  zIndex: 10,
                  position: 'relative',
                }}
              />
            )}
            
            {isSaving && <div style={styles.savingIndicator}>A guardar alterações...</div>}
          </div>
        </main>

        {/* BARRA DIREITA: Configurações do Bloco Selecionado */}
        <aside style={styles.rightSidebar}>
          {selectedBlock ? (
            <div style={styles.settingsPanel}>
              <div style={styles.settingsPanelHeader}>
                <h3 style={{...styles.sidebarTitle, margin: 0}}>Configurações do Bloco</h3>
                <button
                  style={styles.closePanelBtn}
                  onClick={() => setSelectedBlockId(null)}
                  title="Fechar edição do bloco"
                >
                  ✕
                </button>
              </div>
              <p style={{fontSize: '0.8rem', color: '#666', marginBottom: '1.5rem', marginTop: '0.5rem'}}>
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

              {selectedBlock.type === 'REDIRECT' && (
                <>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>URL de Redirecionamento</label>
                    <input 
                      type="url"
                      value={selectedBlock.config?.url || ''}
                      onChange={(e) => handleBlockUpdateLocally(selectedBlock.id, 'config.url', e.target.value)}
                      onBlur={() => handleSaveBlock(selectedBlock)}
                      style={styles.input}
                      placeholder="https://..."
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Texto do Botão</label>
                    <input 
                      type="text"
                      value={selectedBlock.config?.buttonText || ''}
                      onChange={(e) => handleBlockUpdateLocally(selectedBlock.id, 'config.buttonText', e.target.value)}
                      onBlur={() => handleSaveBlock(selectedBlock)}
                      style={styles.input}
                      placeholder="Ex: Acessar Link"
                    />
                  </div>
                </>
              )}

              {selectedBlock.type === 'INPUT_DATE' && (
                <>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Provedor de Calendário</label>
                    <select
                      value={selectedBlock.config?.calendarProvider || 'native'}
                      onChange={(e) => {
                        handleBlockUpdateLocally(selectedBlock.id, 'config.calendarProvider', e.target.value);
                        handleSaveBlock({ ...selectedBlock, config: { ...selectedBlock.config, calendarProvider: e.target.value } });
                      }}
                      style={styles.input}
                    >
                      <option value="native">Nativo do Navegador</option>
                      <option value="Calendly">Calendly</option>
                      <option value="Cal.com">Cal.com</option>
                    </select>
                  </div>
                  {(selectedBlock.config?.calendarProvider === 'Calendly' || selectedBlock.config?.calendarProvider === 'Cal.com') && (
                    <div style={styles.formGroup}>
                      <label style={styles.label}>URL do Evento da Equipa ({selectedBlock.config.calendarProvider})</label>
                      <input 
                        type="url"
                        value={selectedBlock.config?.calendarUrl || ''}
                        onChange={(e) => handleBlockUpdateLocally(selectedBlock.id, 'config.calendarUrl', e.target.value)}
                        onBlur={() => handleSaveBlock(selectedBlock)}
                        style={styles.input}
                        placeholder={`https://${selectedBlock.config.calendarProvider === 'Calendly' ? 'calendly.com/seu-link' : 'cal.com/seu-link'}`}
                      />
                    </div>
                  )}
                  {(!selectedBlock.config?.calendarProvider || selectedBlock.config?.calendarProvider === 'native') && (
                    <div style={styles.formGroup}>
                      <label style={{...styles.label, display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                        <input 
                          type="checkbox"
                          checked={selectedBlock.config?.enableTime || false}
                          onChange={(e) => {
                            handleBlockUpdateLocally(selectedBlock.id, 'config.enableTime', e.target.checked);
                            handleSaveBlock({ ...selectedBlock, config: { ...selectedBlock.config, enableTime: e.target.checked } });
                          }}
                        />
                        Permitir seleção de horário
                      </label>
                    </div>
                  )}
                </>
              )}

              {selectedBlock.type === 'INPUT_RATING' && (
                <div style={styles.formGroup}>
                  <label style={styles.label}>Escala Máxima</label>
                  <select
                    value={selectedBlock.config?.maxScore || 5}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      handleBlockUpdateLocally(selectedBlock.id, 'config.maxScore', val);
                      handleSaveBlock({ ...selectedBlock, config: { ...selectedBlock.config, maxScore: val } });
                    }}
                    style={styles.input}
                  >
                    <option value={5}>5 Estrelas</option>
                    <option value={10}>0 a 10 Numérico</option>
                  </select>
                </div>
              )}

              {selectedBlock.type.startsWith('INPUT_') && selectedBlock.type !== 'INPUT_BUTTONS' && selectedBlock.type !== 'INPUT_SELECT' && selectedBlock.type !== 'INPUT_DATE' && selectedBlock.type !== 'INPUT_RATING' && (
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
            <div style={styles.settingsPanel}>
              <h3 style={{...styles.sidebarTitle, wordWrap: 'break-word', overflowWrap: 'break-word'}}>Configurações Globais / Visual</h3>
              <p style={{fontSize: '0.8rem', color: '#666', marginBottom: '1.5rem'}}>
                Aparência (Branding)
              </p>

              <div style={styles.formGroup}>
                <label style={styles.label}>Imagem de Fundo</label>
                <input 
                  type="file" 
                  accept="image/*"
                  onChange={async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    setIsSaving(true);
                    try {
                      const res = await uploadFile(WORKSPACE_ID, file);
                      const updatedBranding = { ...(form?.branding || {}), backgroundImage: res.url };
                      setForm(prev => ({ ...prev, branding: updatedBranding, hasUnpublishedChanges: true }));
                      await updateForm(WORKSPACE_ID, formId, { branding: updatedBranding });
                    } catch (err) {
                      alert(`Erro no upload: ${err.message}`);
                    } finally {
                      setIsSaving(false);
                    }
                  }}
                  style={{ ...styles.input, padding: '0.3rem' }}
                />
                {form?.branding?.backgroundImage && (
                  <img 
                    src={import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}${form.branding.backgroundImage}` : form.branding.backgroundImage} 
                    alt="Preview de Fundo" 
                    style={{ width: '100%', marginTop: '10px', borderRadius: '6px', objectFit: 'cover', maxHeight: '120px' }} 
                  />
                )}
              </div>

              {/* COR DE FUNDO (Fallback) — Bidirecional */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Cor de Fundo (Padrão)</label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input 
                    type="color"
                    value={form?.branding?.backgroundColor || '#f0f2f5'}
                    onChange={(e) => setForm(prev => ({ ...prev, branding: { ...prev.branding, backgroundColor: e.target.value } }))}
                    onBlur={() => handleSaveFormBranding()}
                    style={{ padding: '0', height: '36px', width: '50px', cursor: 'pointer', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                  />
                  <input 
                    type="text"
                    value={form?.branding?.backgroundColor || '#f0f2f5'}
                    onChange={(e) => {
                      const val = e.target.value;
                      setForm(prev => ({ ...prev, branding: { ...prev.branding, backgroundColor: val } }));
                    }}
                    onBlur={(e) => {
                      const val = e.target.value;
                      if (!isValidHex(val)) {
                        setForm(prev => ({ ...prev, branding: { ...prev.branding, backgroundColor: '#f0f2f5' } }));
                        return;
                      }
                      handleSaveFormBranding();
                    }}
                    style={{ ...styles.input, width: '100px', padding: '0.4rem 0.6rem', fontSize: '0.85rem', fontFamily: 'monospace', marginBottom: 0 }}
                    placeholder="#f0f2f5"
                    maxLength={7}
                  />
                </div>
                <p style={{fontSize: '0.75rem', color: '#888', marginTop: '0.25rem'}}>
                  Usada quando não houver imagem de fundo.
                </p>
              </div>

              {/* COR DOS BOTÕES/DESTAQUE — Bidirecional */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Cor dos Botões/Destaque</label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input 
                    type="color"
                    value={form?.branding?.primaryColor || '#6C63FF'}
                    onChange={(e) => setForm(prev => ({ ...prev, branding: { ...prev.branding, primaryColor: e.target.value } }))}
                    onBlur={() => handleSaveFormBranding()}
                    style={{ padding: '0', height: '36px', width: '50px', cursor: 'pointer', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                  />
                  <input 
                    type="text"
                    value={form?.branding?.primaryColor || '#6C63FF'}
                    onChange={(e) => {
                      const val = e.target.value;
                      setForm(prev => ({ ...prev, branding: { ...prev.branding, primaryColor: val } }));
                    }}
                    onBlur={(e) => {
                      const val = e.target.value;
                      if (!isValidHex(val)) {
                        setForm(prev => ({ ...prev, branding: { ...prev.branding, primaryColor: '#6C63FF' } }));
                        return;
                      }
                      handleSaveFormBranding();
                    }}
                    style={{ ...styles.input, width: '100px', padding: '0.4rem 0.6rem', fontSize: '0.85rem', fontFamily: 'monospace', marginBottom: 0 }}
                    placeholder="#6C63FF"
                    maxLength={7}
                  />
                </div>
              </div>

              {/* MODO SLIDE — Botões e Textos de Apoio */}
              {form?.displayMode === 'SLIDE' && (
                <div style={{ ...styles.sectionCard, marginTop: '1.5rem', borderTop: '4px solid #6C63FF' }}>
                  <h3 style={styles.sectionTitle}>MODO SLIDE — Botões e Textos de Apoio</h3>
                  <p style={{fontSize: '0.8rem', color: '#666', marginBottom: '1.5rem', lineHeight: '1.4'}}>
                    Estas configurações afetam exclusivamente o layout Slide (botão Voltar, tecla Enter, e textos secundários como os placeholders e o "Pergunta X").
                  </p>

                  {/* TEXTO DO BOTÃO VOLTAR */}
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Texto do Botão Voltar</label>
                    <input
                      type="text"
                      className="td-input"
                      value={form?.branding?.slideBackText ?? 'Voltar'}
                      onChange={(e) => setForm(prev => ({ ...prev, branding: { ...prev.branding, slideBackText: e.target.value } }))}
                      onBlur={() => handleSaveFormBranding()}
                      placeholder="Voltar"
                      style={{...styles.input, marginBottom: '0.25rem'}}
                    />
                  </div>

                  {/* TEXTO DA TECLA ENTER */}
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Texto da Tecla de Atalho (Enter)</label>
                    <input
                      type="text"
                      className="td-input"
                      value={form?.branding?.slideEnterText ?? 'Enter'}
                      onChange={(e) => setForm(prev => ({ ...prev, branding: { ...prev.branding, slideEnterText: e.target.value } }))}
                      onBlur={() => handleSaveFormBranding()}
                      placeholder="Enter"
                      style={{...styles.input, marginBottom: '0.25rem'}}
                    />
                  </div>

                  {/* COR DOS TEXTOS DE APOIO */}
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Cor dos Textos de Apoio (Placeholder, etc)</label>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input 
                        type="color"
                        value={form?.branding?.slideHelperTextColor || '#8c8c9a'}
                        onChange={(e) => setForm(prev => ({ ...prev, branding: { ...prev.branding, slideHelperTextColor: e.target.value } }))}
                        onBlur={() => handleSaveFormBranding()}
                        style={{ padding: '0', height: '36px', width: '50px', cursor: 'pointer', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                      />
                      <input 
                        type="text"
                        value={form?.branding?.slideHelperTextColor || '#8c8c9a'}
                        onChange={(e) => {
                          const val = e.target.value;
                          setForm(prev => ({ ...prev, branding: { ...prev.branding, slideHelperTextColor: val } }));
                        }}
                        onBlur={(e) => {
                          const val = e.target.value;
                          if (!isValidHex(val)) {
                            setForm(prev => ({ ...prev, branding: { ...prev.branding, slideHelperTextColor: '#8c8c9a' } }));
                            return;
                          }
                          handleSaveFormBranding();
                        }}
                        style={{ ...styles.input, width: '100px', padding: '0.4rem 0.6rem', fontSize: '0.85rem', fontFamily: 'monospace', marginBottom: 0 }}
                        placeholder="#8c8c9a"
                        maxLength={7}
                      />
                    </div>
                  </div>

                  {/* COR DE FUNDO DOS BOTÕES DE APOIO */}
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Fundo dos Botões de Apoio (Voltar / Enter)</label>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input 
                        type="color"
                        value={form?.branding?.slideSupportBtnBgColor || '#f0f2f5'}
                        onChange={(e) => setForm(prev => ({ ...prev, branding: { ...prev.branding, slideSupportBtnBgColor: e.target.value } }))}
                        onBlur={() => handleSaveFormBranding()}
                        style={{ padding: '0', height: '36px', width: '50px', cursor: 'pointer', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                      />
                      <input 
                        type="text"
                        value={form?.branding?.slideSupportBtnBgColor || '#f0f2f5'}
                        onChange={(e) => {
                          const val = e.target.value;
                          setForm(prev => ({ ...prev, branding: { ...prev.branding, slideSupportBtnBgColor: val } }));
                        }}
                        onBlur={(e) => {
                          const val = e.target.value;
                          if (!isValidHex(val)) {
                            setForm(prev => ({ ...prev, branding: { ...prev.branding, slideSupportBtnBgColor: '#f0f2f5' } }));
                            return;
                          }
                          handleSaveFormBranding();
                        }}
                        style={{ ...styles.input, width: '100px', padding: '0.4rem 0.6rem', fontSize: '0.85rem', fontFamily: 'monospace', marginBottom: 0 }}
                        placeholder="#f0f2f5"
                        maxLength={7}
                      />
                    </div>
                  </div>

                  {/* COR DO TEXTO DOS BOTÕES DE APOIO */}
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Texto dos Botões de Apoio</label>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input 
                        type="color"
                        value={form?.branding?.slideSupportBtnTextColor || '#8c8c9a'}
                        onChange={(e) => setForm(prev => ({ ...prev, branding: { ...prev.branding, slideSupportBtnTextColor: e.target.value } }))}
                        onBlur={() => handleSaveFormBranding()}
                        style={{ padding: '0', height: '36px', width: '50px', cursor: 'pointer', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                      />
                      <input 
                        type="text"
                        value={form?.branding?.slideSupportBtnTextColor || '#8c8c9a'}
                        onChange={(e) => {
                          const val = e.target.value;
                          setForm(prev => ({ ...prev, branding: { ...prev.branding, slideSupportBtnTextColor: val } }));
                        }}
                        onBlur={(e) => {
                          const val = e.target.value;
                          if (!isValidHex(val)) {
                            setForm(prev => ({ ...prev, branding: { ...prev.branding, slideSupportBtnTextColor: '#8c8c9a' } }));
                            return;
                          }
                          handleSaveFormBranding();
                        }}
                        style={{ ...styles.input, width: '100px', padding: '0.4rem 0.6rem', fontSize: '0.85rem', fontFamily: 'monospace', marginBottom: 0 }}
                        placeholder="#8c8c9a"
                        maxLength={7}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* MODO CHAT — Avatar e Cores */}
              {form?.displayMode === 'CHAT' && (
                <div style={{ ...styles.sectionCard, marginTop: '1.5rem', borderTop: '4px solid #10b981' }}>
                  <h3 style={styles.sectionTitle}>MODO CHAT — Avatar e Cabeçalho</h3>
                  <p style={{fontSize: '0.8rem', color: '#666', marginBottom: '1.5rem', lineHeight: '1.4'}}>
                    Configurações exclusivas do layout conversacional.
                  </p>

                  {/* AVATAR UPLOAD */}
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Avatar do Bot</label>
                    <input 
                      type="file" 
                      accept="image/png, image/jpeg, image/gif, image/webp"
                      onChange={handleAvatarUpload}
                      style={styles.input}
                      disabled={isUploadingAvatar}
                    />
                    {isUploadingAvatar && <p style={{fontSize: '0.8rem', color: '#6C63FF'}}>Enviando avatar...</p>}
                    {form?.branding?.avatarUrl && (
                      <img 
                        src={import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}${form.branding.avatarUrl}` : form.branding.avatarUrl} 
                        alt="Preview Avatar" 
                        style={{ 
                          width: '60px', height: '60px', marginTop: '10px', 
                          borderRadius: '50%', objectFit: 'cover', 
                          border: '2px solid #e2e8f0'
                        }} 
                      />
                    )}
                    <p style={{fontSize: '0.75rem', color: '#888', marginTop: '0.25rem'}}>
                      Imagem circular exibida no header do chat.
                    </p>
                  </div>

                  {/* COR SECUNDÁRIA (Header/Input do Chat) — Bidirecional */}
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Fundo do Cabeçalho e Mensagens (Chat)</label>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input 
                        type="color"
                        value={form?.branding?.secondaryColor || '#ffffff'}
                        onChange={(e) => setForm(prev => ({ ...prev, branding: { ...prev.branding, secondaryColor: e.target.value } }))}
                        onBlur={() => handleSaveFormBranding()}
                        style={{ padding: '0', height: '36px', width: '50px', cursor: 'pointer', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                      />
                      <input 
                        type="text"
                        value={form?.branding?.secondaryColor || '#ffffff'}
                        onChange={(e) => {
                          const val = e.target.value;
                          setForm(prev => ({ ...prev, branding: { ...prev.branding, secondaryColor: val } }));
                        }}
                        onBlur={(e) => {
                          const val = e.target.value;
                          if (!isValidHex(val)) {
                            setForm(prev => ({ ...prev, branding: { ...prev.branding, secondaryColor: '#ffffff' } }));
                            return;
                          }
                          handleSaveFormBranding();
                        }}
                        style={{ ...styles.input, width: '100px', padding: '0.4rem 0.6rem', fontSize: '0.85rem', fontFamily: 'monospace', marginBottom: 0 }}
                        placeholder="#ffffff"
                        maxLength={7}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* COR DO TEXTO — Bidirecional */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Cor do Texto</label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input 
                    type="color"
                    value={form?.branding?.textColor || '#1a1a2e'}
                    onChange={(e) => setForm(prev => ({ ...prev, branding: { ...prev.branding, textColor: e.target.value } }))}
                    onBlur={() => handleSaveFormBranding()}
                    style={{ padding: '0', height: '36px', width: '50px', cursor: 'pointer', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                  />
                  <input 
                    type="text"
                    value={form?.branding?.textColor || '#1a1a2e'}
                    onChange={(e) => {
                      const val = e.target.value;
                      setForm(prev => ({ ...prev, branding: { ...prev.branding, textColor: val } }));
                    }}
                    onBlur={(e) => {
                      const val = e.target.value;
                      if (!isValidHex(val)) {
                        setForm(prev => ({ ...prev, branding: { ...prev.branding, textColor: '#1a1a2e' } }));
                        return;
                      }
                      handleSaveFormBranding();
                    }}
                    style={{ ...styles.input, width: '100px', padding: '0.4rem 0.6rem', fontSize: '0.85rem', fontFamily: 'monospace', marginBottom: 0 }}
                    placeholder="#1a1a2e"
                    maxLength={7}
                  />
                </div>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Fonte Premium</label>
                <select 
                  value={form?.branding?.fontFamily || 'Inter'}
                  onChange={async (e) => {
                    const updatedBranding = { ...(form?.branding || {}), fontFamily: e.target.value };
                    setForm(prev => ({ ...prev, branding: updatedBranding, hasUnpublishedChanges: true }));
                    setIsSaving(true);
                    try {
                      await updateForm(WORKSPACE_ID, formId, { branding: updatedBranding });
                    } catch (err) {
                      alert(`Erro: ${err.message}`);
                    } finally {
                      setIsSaving(false);
                    }
                  }}
                  style={styles.input}
                >
                  <option value="Inter">Inter</option>
                  <option value="Roboto">Roboto</option>
                  <option value="Poppins">Poppins</option>
                  <option value="Montserrat">Montserrat</option>
                  <option value="Outfit">Outfit</option>
                </select>
              </div>

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
  settingsPanelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
  },
  closePanelBtn: {
    background: 'none',
    border: 'none',
    fontSize: '1.2rem',
    cursor: 'pointer',
    color: '#888',
    padding: '0.2rem',
    lineHeight: '1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '4px',
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
