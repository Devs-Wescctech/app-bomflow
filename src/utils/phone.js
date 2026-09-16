/**
 * Returns a Brazilian national phone number as digits only.
 *
 * The application stores phones without punctuation and without the Brazilian
 * country code.  A leading 55 is removed only from the unambiguous
 * international lengths (12 digits for landlines and 13 for mobiles).
 */
export function normalizePhone(value) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    digits = digits.slice(2);
  }
  return digits.slice(0, 11);
}

/**
 * Progressively formats a Brazilian national phone while it is being typed.
 * Complete landlines use (DD) NNNN-NNNN and mobiles use (DD) NNNNN-NNNN.
 */
export function formatBrazilPhone(value) {
  const digits = normalizePhone(value);
  if (!digits) return "";
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

/**
 * Returns true only for an empty optional value or a complete Brazilian
 * national phone (DDD plus 8 or 9 subscriber digits).
 */
export function isValidBrazilPhone(value, { allowEmpty = true } = {}) {
  const raw = String(value ?? "").replace(/\D/g, "");
  if (!raw) return allowEmpty && String(value ?? "").trim() === "";
  const national =
    raw.startsWith("55") && (raw.length === 12 || raw.length === 13)
      ? raw.slice(2)
      : raw;
  return national.length === 10 || national.length === 11;
}

export function brazilPhoneValidationMessage(value, options) {
  return isValidBrazilPhone(value, options)
    ? ""
    : "Informe um telefone com DDD e 10 ou 11 dígitos.";
}

/**
 * Converts a national Brazilian phone to the provider representation used by
 * WhatsApp integrations (digits only, including country code 55).
 */
export function normalizeBrazilPhoneE164(value) {
  const national = normalizePhone(value);
  if (!national) return "";
  if (national.length === 10 && /^[6789]/.test(national.slice(2))) {
    return `55${national.slice(0, 2)}9${national.slice(2)}`;
  }
  return `55${national}`;
}

// Descriptive aliases keep call sites readable and make the storage/display
// contract explicit for consumers that share naming with the backend utility.
export const normalizeBrazilPhoneNational = normalizePhone;
export const formatPhone = formatBrazilPhone;

export default formatBrazilPhone;