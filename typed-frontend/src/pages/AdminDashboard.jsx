// =============================================================================
// TypeD V2 — Admin Dashboard
// =============================================================================

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getForms, createForm, duplicateForm } from '../lib/api.js';

const WORKSPACE_ID = "ws-mock-123";

export default function AdminDashboard() {
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newFormName, setNewFormName] = useState('');
  const [newFormMode, setNewFormMode] = useState('CHAT');
  const [isCreating, setIsCreating] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState(null);

  const navigate = useNavigate();

  useEffect(() => {
    loadForms();
  }, []);

  async function loadForms() {
    setLoading(true);
    try {
      const data = await getForms(WORKSPACE_ID);
      setForms(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateForm(e) {
    e.preventDefault();
    if (!newFormName.trim()) return;

    setIsCreating(true);
    try {
      const newForm = await createForm(WORKSPACE_ID, {
        name: newFormName,
        displayMode: newFormMode,
      });
      // Redireciona logo para o builder do novo formulário
      navigate(`/admin/forms/${newForm.id}`);
    } catch (err) {
      alert(`Erro ao criar formulário: ${err.message}`);
      setIsCreating(false);
    }
  }

  async function handleDuplicateForm(e, formId, formName) {
    e.stopPropagation(); // Evita navegar para o form
    if (!window.confirm(`Deseja duplicar o formulário "${formName}"?`)) return;

    setDuplicatingId(formId);
    try {
      await duplicateForm(WORKSPACE_ID, formId);
      await loadForms();
    } catch (err) {
      alert(`Erro ao duplicar formulário: ${err.message}`);
    } finally {
      setDuplicatingId(null);
    }
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>TypeD Workspace</h1>
          <p style={styles.subtitle}>Gerencie os seus formulários e funis.</p>
        </div>
        <button style={styles.primaryButton} onClick={() => setIsModalOpen(true)}>
          + Criar Formulário
        </button>
      </header>

      {error && (
        <div style={styles.errorBox}>
          <strong>Erro:</strong> {error}
        </div>
      )}

      {loading ? (
        <div style={styles.loading}>Carregando formulários...</div>
      ) : forms.length === 0 ? (
        <div style={styles.emptyState}>
          <h3>Nenhum formulário encontrado</h3>
          <p>Crie o seu primeiro formulário para começar a captar leads.</p>
          <button style={styles.primaryButton} onClick={() => setIsModalOpen(true)}>
            Criar Formulário
          </button>
        </div>
      ) : (
        <div style={styles.grid}>
          {forms.map(form => (
            <div 
              key={form.id} 
              style={styles.card}
              onClick={() => navigate(`/admin/forms/${form.id}`)}
            >
              <div style={styles.cardHeader}>
                <span style={styles.badge}>{form.displayMode}</span>
                <span style={form.isPublished ? styles.statusActive : styles.statusDraft}>
                  {form.isPublished ? 'Publicado' : 'Rascunho'}
                </span>
              </div>
              <h3 style={styles.cardTitle}>{form.name}</h3>
              <p style={styles.cardUrl}>/f/{form.slug}</p>
              
              <div style={styles.cardFooter}>
                <div style={styles.cardStats}>
                  <div style={styles.stat}>
                    <strong>{form._count?.submissions || 0}</strong> leads
                  </div>
                  <div style={styles.stat}>
                    <strong>{form._count?.blocks || 0}</strong> blocos
                  </div>
                </div>
                <button 
                  style={styles.duplicateButton}
                  onClick={(e) => handleDuplicateForm(e, form.id, form.name)}
                  disabled={duplicatingId === form.id}
                  title="Duplicar formulário"
                >
                  {duplicatingId === form.id ? '⏳' : '📄 Copiar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL DE CRIAÇÃO */}
      {isModalOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <h2 style={styles.modalTitle}>Novo Formulário</h2>
            <form onSubmit={handleCreateForm}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Nome do Formulário</label>
                <input 
                  type="text" 
                  autoFocus
                  required
                  value={newFormName}
                  onChange={e => setNewFormName(e.target.value)}
                  style={styles.input}
                  placeholder="Ex: Captação Black Friday"
                />
              </div>
              
              <div style={styles.formGroup}>
                <label style={styles.label}>Modo de Exibição</label>
                <select 
                  value={newFormMode}
                  onChange={e => setNewFormMode(e.target.value)}
                  style={styles.input}
                >
                  <option value="CHAT">Chat (Conversacional)</option>
                  <option value="SLIDE">Slide (Uma pergunta por tela)</option>
                </select>
              </div>

              <div style={styles.modalActions}>
                <button 
                  type="button" 
                  style={styles.secondaryButton}
                  onClick={() => setIsModalOpen(false)}
                  disabled={isCreating}
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  style={styles.primaryButton}
                  disabled={isCreating}
                >
                  {isCreating ? 'Criando...' : 'Criar Formulário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Estilos Inline (Clean / SaaS Style)
// =============================================================================
const styles = {
  container: {
    maxWidth: '1000px',
    width: '100%',
    boxSizing: 'border-box',
    margin: '0 auto',
    padding: '2rem',
    fontFamily: 'system-ui, sans-serif',
    color: '#1a1a2e',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '2rem',
    paddingBottom: '1.5rem',
    borderBottom: '1px solid #eaeaea',
  },
  title: {
    margin: 0,
    fontSize: '1.8rem',
    fontWeight: '600',
  },
  subtitle: {
    margin: '0.25rem 0 0 0',
    color: '#666',
    fontSize: '0.95rem',
  },
  primaryButton: {
    backgroundColor: '#6C63FF',
    color: '#fff',
    border: 'none',
    padding: '0.6rem 1.2rem',
    borderRadius: '6px',
    fontWeight: '500',
    cursor: 'pointer',
    fontSize: '0.95rem',
    transition: 'background 0.2s',
  },
  secondaryButton: {
    backgroundColor: '#fff',
    color: '#333',
    border: '1px solid #ccc',
    padding: '0.6rem 1.2rem',
    borderRadius: '6px',
    fontWeight: '500',
    cursor: 'pointer',
    fontSize: '0.95rem',
  },
  errorBox: {
    padding: '1rem',
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    borderRadius: '6px',
    marginBottom: '1rem',
  },
  loading: {
    textAlign: 'center',
    padding: '3rem',
    color: '#666',
  },
  emptyState: {
    textAlign: 'center',
    padding: '4rem 2rem',
    backgroundColor: '#f8f9fa',
    borderRadius: '12px',
    border: '1px dashed #ccc',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '1.5rem',
  },
  card: {
    backgroundColor: '#fff',
    border: '1px solid #eaeaea',
    borderRadius: '12px',
    padding: '1.5rem',
    cursor: 'pointer',
    transition: 'transform 0.2s, box-shadow 0.2s',
    boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '1rem',
  },
  badge: {
    backgroundColor: '#f0f2f5',
    color: '#555',
    padding: '0.2rem 0.5rem',
    borderRadius: '4px',
    fontSize: '0.75rem',
    fontWeight: '600',
    letterSpacing: '0.05em',
  },
  statusActive: {
    color: '#16a34a',
    fontSize: '0.75rem',
    fontWeight: '600',
  },
  statusDraft: {
    color: '#d97706',
    fontSize: '0.75rem',
    fontWeight: '600',
  },
  cardTitle: {
    margin: '0 0 0.25rem 0',
    fontSize: '1.2rem',
  },
  cardUrl: {
    margin: '0 0 1.25rem 0',
    color: '#888',
    fontSize: '0.85rem',
  },
  cardFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTop: '1px solid #eaeaea',
    paddingTop: '1rem',
  },
  cardStats: {
    display: 'flex',
    gap: '1rem',
    fontSize: '0.85rem',
    color: '#555',
  },
  stat: {
    display: 'flex',
    gap: '0.3rem',
    alignItems: 'center',
  },
  duplicateButton: {
    background: 'none',
    border: '1px solid #eaeaea',
    borderRadius: '6px',
    padding: '4px 8px',
    fontSize: '0.8rem',
    cursor: 'pointer',
    color: '#555',
    transition: 'background 0.2s',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  modalContent: {
    backgroundColor: '#fff',
    padding: '2rem',
    borderRadius: '12px',
    width: '100%',
    maxWidth: '400px',
    boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
  },
  modalTitle: {
    margin: '0 0 1.5rem 0',
  },
  formGroup: {
    marginBottom: '1.25rem',
  },
  label: {
    display: 'block',
    marginBottom: '0.5rem',
    fontWeight: '500',
    fontSize: '0.9rem',
  },
  input: {
    width: '100%',
    padding: '0.6rem',
    border: '1px solid #ccc',
    borderRadius: '6px',
    fontSize: '1rem',
    boxSizing: 'border-box',
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.75rem',
    marginTop: '2rem',
  }
};
