// =============================================================================
// TypeD V2 — API Client (Frontend → Backend)
// =============================================================================
//
// SEGURANÇA:
// - Timeout de 15s para prevenir conexões penduradas
// - AbortController para cancelamento limpo em unmount do React
// - Validação de Content-Type na resposta (previne respostas HTML inesperadas)
// - Nunca envia cookies/credenciais para a API (credentials: 'omit')
// - Sem eval() ou innerHTML nos dados da API
//
// Em desenvolvimento, as requests vão para /api/* (proxy do Vite → :4012).
// Em produção, VITE_API_URL define a URL absoluta do backend.
// =============================================================================

const API_BASE = import.meta.env.VITE_API_URL || '';

// Timeout padrão em milissegundos.
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Erro customizado para respostas HTTP não-2xx.
 * Inclui o status code e o body parseado para handling granular.
 */
export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {number} status
   * @param {object|null} body
   */
  constructor(message, status, body = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/**
 * Faz uma request segura à API do TypeD.
 *
 * @param {string} path - Caminho relativo (ex: '/api/f/meu-form')
 * @param {object} [options] - Opções do fetch
 * @param {string} [options.method='GET']
 * @param {object} [options.body] - Body (será serializado para JSON)
 * @param {AbortSignal} [options.signal] - AbortSignal para cancelamento
 * @param {number} [options.timeoutMs] - Timeout customizado em ms
 * @returns {Promise<object>} Resposta parseada como JSON
 * @throws {ApiError} Se a resposta não for 2xx
 */
export async function apiFetch(path, options = {}) {
  const {
    method = 'GET',
    body,
    signal: externalSignal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  // -----------------------------------------------------------------------
  // SEGURANÇA: Timeout via AbortController
  // Previne que o browser fique preso numa request infinita (ex: servidor
  // caiu mas o TCP não fechou). Combina com signal externo do React.
  // -----------------------------------------------------------------------
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

  // Combina o signal de timeout com o signal externo (unmount do componente).
  // Se QUALQUER um dos dois abortar, a request é cancelada.
  const combinedSignal = externalSignal
    ? AbortSignal.any([timeoutController.signal, externalSignal])
    : timeoutController.signal;

  try {
    const headers = {
      'Accept': 'application/json',
    };
    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      // SEGURANÇA: Nunca enviar cookies automaticamente.
      // A API usa tokens explícitos (JWT no header), não cookies de sessão.
      // Isso previne CSRF completamente — sem cookie, sem CSRF.
      credentials: 'omit',
      signal: combinedSignal,
      body: body ? JSON.stringify(body) : undefined,
    });

    clearTimeout(timeoutId);

    // Resposta 204 (No Content) não tem body.
    if (response.status === 204) {
      return null;
    }

    // -----------------------------------------------------------------------
    // SEGURANÇA: Validar Content-Type da resposta.
    // Se o servidor retornar HTML (ex: página de erro do Nginx 502),
    // não tentar parsear como JSON — lança erro explícito.
    // -----------------------------------------------------------------------
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new ApiError(
        `Resposta inesperada do servidor (Content-Type: ${contentType})`,
        response.status
      );
    }

    const data = await response.json();

    if (!response.ok) {
      throw new ApiError(
        data.message || `Erro HTTP ${response.status}`,
        response.status,
        data
      );
    }

    return data;
  } catch (err) {
    clearTimeout(timeoutId);

    // Re-throw se já é um ApiError.
    if (err instanceof ApiError) throw err;

    // AbortError = timeout ou unmount do componente.
    if (err.name === 'AbortError') {
      throw new ApiError('Request cancelada ou timeout excedido.', 0);
    }

    // Network error (offline, DNS, etc.)
    throw new ApiError(
      'Falha na conexão com o servidor. Verifique sua internet.',
      0
    );
  }
}

// =============================================================================
// MÉTODOS ESPECÍFICOS DA API PÚBLICA
// =============================================================================

export function fetchPublicForm(slug, options = {}) {
  const { signal, preview } = options;
  const query = preview ? '?preview=true' : '';
  return apiFetch(`/api/f/${encodeURIComponent(slug)}${query}`, { signal });
}

/**
 * Envia a submissão completa (lead final).
 *
 * @param {string} slug
 * @param {object} payload - Respostas do lead
 * @param {object} metadata - UTMs, browser, etc.
 * @param {AbortSignal} [signal]
 * @returns {Promise<{success: boolean, submissionId: string}>}
 */
export function submitForm(slug, payload, metadata, signal) {
  return apiFetch(`/api/f/${encodeURIComponent(slug)}/submit`, {
    method: 'POST',
    body: { payload, metadata },
    signal,
  });
}

/**
 * Salva progresso parcial (anti-abandono).
 *
 * @param {string} slug
 * @param {object} payload - Respostas acumuladas até agora
 * @param {object} metadata - UTMs, browser, etc.
 * @param {string|null} [submissionId] - ID existente para update, ou null para criar
 * @param {AbortSignal} [signal]
 * @returns {Promise<{success: boolean, submissionId: string, isNew: boolean}>}
 */
export function savePartial(slug, payload, metadata, submissionId, signal) {
  return apiFetch(`/api/f/${encodeURIComponent(slug)}/partial`, {
    method: 'POST',
    body: { payload, metadata, submissionId },
    signal,
  });
}

// =============================================================================
// MÉTODOS DA API ADMINISTRATIVA (Gestão)
// =============================================================================

export function getForms(workspaceId, signal) {
  return apiFetch(`/api/workspaces/${workspaceId}/forms`, { signal });
}

export function createForm(workspaceId, payload, signal) {
  return apiFetch(`/api/workspaces/${workspaceId}/forms`, {
    method: 'POST',
    body: payload,
    signal,
  });
}

export function updateForm(workspaceId, formId, payload, signal) {
  return apiFetch(`/api/workspaces/${workspaceId}/forms/${formId}`, {
    method: 'PUT',
    body: payload,
    signal,
  });
}

export function getFormDetails(workspaceId, formId, signal) {
  return apiFetch(`/api/workspaces/${workspaceId}/forms/${formId}`, { signal });
}

export function createBlock(workspaceId, formId, payload, signal) {
  return apiFetch(`/api/workspaces/${workspaceId}/forms/${formId}/blocks`, {
    method: 'POST',
    body: payload,
    signal,
  });
}

export function updateBlock(workspaceId, formId, blockId, payload, signal) {
  return apiFetch(`/api/workspaces/${workspaceId}/forms/${formId}/blocks/${blockId}`, {
    method: 'PUT',
    body: payload,
    signal,
  });
}

export function deleteBlock(workspaceId, formId, blockId, signal) {
  return apiFetch(`/api/workspaces/${workspaceId}/forms/${formId}/blocks/${blockId}`, {
    method: 'DELETE',
    signal,
  });
}

export function reorderBlocks(workspaceId, formId, orderedIds, signal) {
  return apiFetch(`/api/workspaces/${workspaceId}/forms/${formId}/blocks/reorder`, {
    method: 'PUT',
    body: { orderedIds },
    signal,
  });
}

// =============================================================================
// MÉTODOS DE PUBLICAÇÃO (Draft → Production)
// =============================================================================

export function publishForm(workspaceId, formId, signal) {
  return apiFetch(`/api/workspaces/${workspaceId}/forms/${formId}/publish`, {
    method: 'POST',
    signal,
  });
}

export function unpublishForm(workspaceId, formId, signal) {
  return apiFetch(`/api/workspaces/${workspaceId}/forms/${formId}/unpublish`, {
    method: 'POST',
    signal,
  });
}

export function discardDraft(workspaceId, formId, signal) {
  return apiFetch(`/api/workspaces/${workspaceId}/forms/${formId}/discard`, {
    method: 'POST',
    signal,
  });
}
