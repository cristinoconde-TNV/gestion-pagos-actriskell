/**
 * Normaliza un número de socio al formato de 5 dígitos rellenados con ceros a la izquierda (ej. "00042").
 */
export function formatSocioNumberPadded(raw?: string | number | null): string | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  const digitsOnly = trimmed.replace(/\D+/g, '');
  if (digitsOnly.length > 0) {
    return digitsOnly.padStart(5, '0');
  }

  return trimmed.padStart(5, '0');
}
