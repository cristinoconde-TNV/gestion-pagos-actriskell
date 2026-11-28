/**
 * Utilidades compartidas de normalización, validación y enlaces para teléfonos.
 */

/**
 * Limpia espacios en los extremos antes de almacenar un número en base de datos.
 */
export const normalizePhoneForStorage = (phone?: string | null): string => {
  return typeof phone === 'string' ? phone.trim() : '';
};

/**
 * Conserva únicamente dígitos y el prefijo `+` para enlaces `tel:`.
 */
export const normalizePhoneForTel = (phone?: string | null): string => {
  return normalizePhoneForStorage(phone).replace(/[^\d+]/g, '');
};

/**
 * Conserva únicamente dígitos numéricos para enlaces de WhatsApp (`wa.me`) o comprobaciones numéricas.
 */
export const normalizePhoneForWhatsapp = (phone?: string | null): string => {
  return normalizePhoneForTel(phone).replace(/^\+/, '').replace(/[^0-9]/g, '');
};

/**
 * Comprueba que el teléfono contenga al menos `minDigits` dígitos válidos.
 */
export const isValidPhoneDigits = (phone?: string | null, minDigits = 6): boolean => {
  return normalizePhoneForWhatsapp(phone).length >= minDigits;
};

/**
 * Construye un enlace `tel:...` seguro o `null` si el teléfono está vacío.
 */
export const buildTelHref = (phone?: string | null): string | null => {
  const normalized = normalizePhoneForTel(phone);
  return normalized ? `tel:${normalized}` : null;
};

/**
 * Construye una URL `https://wa.me/...` con texto opcional codificado, o `null` si no hay dígitos válidos.
 */
export const buildWhatsappHref = (phone?: string | null, message?: string): string | null => {
  const digits = normalizePhoneForWhatsapp(phone);
  if (!digits) return null;
  if (message !== undefined) {
    return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  }
  return `https://wa.me/${digits}`;
};
