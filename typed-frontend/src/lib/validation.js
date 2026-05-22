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
 * Valida matematicamente um CPF brasileiro.
 * @param {string} cpf 
 * @returns {boolean}
 */
export function isValidCPF(cpf) {
  if (!cpf) return false;
  // Remove caracteres não numéricos
  const strCPF = cpf.replace(/[^\d]+/g, '');
  
  if (strCPF.length !== 11) return false;
  
  // Elimina CPFs com todos os dígitos repetidos (ex: 111.111.111-11)
  if (/^(\d)\1{10}$/.test(strCPF)) return false;

  let sum = 0;
  let remainder;

  for (let i = 1; i <= 9; i++) {
    sum += parseInt(strCPF.substring(i - 1, i)) * (11 - i);
  }
  remainder = (sum * 10) % 11;

  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(strCPF.substring(9, 10))) return false;

  sum = 0;
  for (let i = 1; i <= 10; i++) {
    sum += parseInt(strCPF.substring(i - 1, i)) * (12 - i);
  }
  remainder = (sum * 10) % 11;

  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(strCPF.substring(10, 11))) return false;

  return true;
}

/**
 * Valida um valor com base no tipo do bloco.
 * @param {string} blockType - Ex: INPUT_EMAIL, INPUT_PHONE, INPUT_TEXT, INPUT_CPF
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

    case 'INPUT_CPF': {
      if (!isValidCPF(value)) {
        return { valid: false, message: 'Digite um CPF válido.' };
      }
      return { valid: true, message: null };
    }

    default:
      // Todos os outros tipos: valida apenas se não está vazio
      return { valid: true, message: null };
  }
}
