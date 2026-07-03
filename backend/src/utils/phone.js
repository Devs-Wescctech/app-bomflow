// Utilitário único de normalização de telefone brasileiro para envio via WhatsApp.
//
// Problema que ele resolve: a WHU/WhatsApp precisa do número no formato canônico
// (E.164 sem símbolos), e celulares brasileiros exigem o "nono dígito". Antes,
// cada ponto de envio fazia `replace(/\D/g,'')` + `55` na frente, sem inserir o 9,
// então `(51) 8153-2008` era enviado como `555181532008` (8 dígitos, sem o 9) e o
// template caía em um número frio — nada era entregue. Esta função insere o 9
// quando o número é celular, preservando fixos e números que já vêm corretos.

const DIGIT_RE = /\D/g;

// Extrai o número nacional (DDD + assinante) removendo o código do país 55 quando
// o comprimento indica que ele está presente (12 = fixo com país, 13 = celular com país).
function stripCountryCode(digits) {
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits.slice(2);
  }
  return digits;
}

/**
 * Normaliza um telefone brasileiro para o formato canônico usado no envio:
 * só dígitos, com `55` na frente e com o nono dígito inserido quando for celular.
 *
 * Regras:
 * - Remove qualquer máscara/símbolo/espaço.
 * - Remove o código do país 55 quando presente (para trabalhar com o número nacional).
 * - Número nacional com 11 dígitos (DDD + 9 dígitos): já é celular com o 9 → mantém.
 * - Número nacional com 10 dígitos (DDD + 8 dígitos):
 *     - se o assinante (8 dígitos) começa com 6/7/8/9 → é celular sem o 9 → insere o 9.
 *     - caso contrário (começa com 2/3/4/5) → é telefone fixo → mantém.
 * - Outros comprimentos: melhor esforço, apenas garante o prefixo 55.
 *
 * @param {string|number} phone telefone em qualquer formato
 * @returns {string} número canônico só com dígitos (ex.: 5551981532008) ou '' se vazio
 */
export function normalizeBrazilPhone(phone) {
  const raw = String(phone ?? '').replace(DIGIT_RE, '');
  if (!raw) return '';

  const national = stripCountryCode(raw);

  if (national.length === 11) {
    // DDD + 9 dígitos: celular já com o nono dígito.
    return `55${national}`;
  }

  if (national.length === 10) {
    const ddd = national.slice(0, 2);
    const subscriber = national.slice(2); // 8 dígitos
    if (/^[6789]/.test(subscriber)) {
      // Celular sem o nono dígito (assinante de 8 dígitos começando com 6/7/8/9).
      return `55${ddd}9${subscriber}`;
    }
    // Telefone fixo (assinante começa com 2/3/4/5): mantém como está.
    return `55${national}`;
  }

  // Comprimentos fora do padrão nacional (entrada incompleta, internacional, etc.):
  // não há como inferir o nono dígito com segurança — apenas garante o prefixo 55.
  return raw.startsWith('55') ? raw : `55${raw}`;
}

/**
 * Retorna a variante alternativa de um celular (com/sem o nono dígito) para a
 * rede de segurança de entrega: se o envio ao número canônico não chegar, tenta-se
 * a outra forma uma única vez. Para telefones fixos (ou entradas sem par possível)
 * retorna null.
 *
 * @param {string|number} phone telefone em qualquer formato
 * @returns {string|null} variante alternativa só com dígitos, ou null se não houver
 */
export function alternateBrazilPhone(phone) {
  const canonical = normalizeBrazilPhone(phone);
  if (!canonical.startsWith('55')) return null;

  const national = canonical.slice(2);

  // Celular canônico (DDD + 9 + 8 dígitos): a alternativa é remover o nono dígito.
  if (national.length === 11 && national[2] === '9') {
    const ddd = national.slice(0, 2);
    const subscriber = national.slice(3); // 8 dígitos
    return `55${ddd}${subscriber}`;
  }

  // Número de 10 dígitos com assinante começando em 6/7/8/9 seria promovido a
  // celular pela normalização, então este caminho cobre apenas fixos → sem par.
  return null;
}
