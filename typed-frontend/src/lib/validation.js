// =============================================================================
// TypeD V2 — Módulo de Validação de Inputs
// =============================================================================
// Centraliza as regras de validação para todos os renderizadores (Chat e Slide).
// Retorna { valid: boolean, message: string | null }.
// =============================================================================

import { isValidPhoneNumber } from 'react-phone-number-input';

// Regex padrão de mercado para e-mail:
// - Texto antes do @
// - Domínio com pelo menos um ponto
// - TLD com 2+ caracteres (cobre .com, .com.br, .net, .org, etc.)
const EMAIL_REGEX = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

/**
 * Valida um valor com base no tipo do bloco.
 * @param {string} blockType - Ex: INPUT_EMAIL, INPUT_PHONE, INPUT_TEXT
 * @param {string} value - Valor digitado pelo usuário
 * @returns {{ valid: boolean, message: string | null }}
 */
export function validateInput(blockType, value) {
  if (!value || (typeof value === 'string' && !value.trim())) {
    return { valid: false, message: null }; // Vazio → sem mensagem de erro, apenas bloqueia
  }

  switch (blockType) {
    case 'INPUT_EMAIL': {
      const trimmed = value.trim();
      if (!EMAIL_REGEX.test(trimmed)) {
        return { valid: false, message: 'Digite um e-mail válido. Ex: nome@empresa.com' };
      }
      return { valid: true, message: null };
    }

    case 'INPUT_PHONE': {
      // value já vem no formato E.164 da biblioteca react-phone-number-input
      if (!isValidPhoneNumber(value || '')) {
        return { valid: false, message: 'Número de telefone incompleto ou inválido.' };
      }
      return { valid: true, message: null };
    }

    default:
      // Todos os outros tipos: valida apenas se não está vazio
      return { valid: true, message: null };
  }
}
