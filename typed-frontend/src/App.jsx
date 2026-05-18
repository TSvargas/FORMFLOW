// =============================================================================
// TypeD V2 — App Root (Roteamento)
// =============================================================================

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import PublicForm from './pages/PublicForm.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import FormBuilder from './pages/FormBuilder.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Rota pública: /f/:slug → Formulário para o lead */}
        <Route path="/f/:slug" element={<PublicForm />} />

        {/* Rotas Administrativas */}
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/forms/:formId" element={<FormBuilder />} />
        
        {/* Redireciona a raiz para /admin temporariamente */}
        <Route path="/" element={<Navigate to="/admin" replace />} />

        {/* Fallback: redireciona para uma mensagem simples */}
        <Route
          path="*"
          element={
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: '100vh',
              fontFamily: 'system-ui, sans-serif',
              color: '#666',
            }}>
              <p>TypeD V2 — Aceda a <code>/f/seu-slug</code> para ver um formulário.</p>
            </div>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
