export const MADRID_TIMEZONE = 'Europe/Madrid';

/**
 * Devuelve la fecha en formato ISO (YYYY-MM-DD) en la zona horaria Europe/Madrid.
 */
export function getMadridDateIso(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MADRID_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;

  if (year && month && day) {
    return `${year}-${month}-${day}`;
  }

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MADRID_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}
