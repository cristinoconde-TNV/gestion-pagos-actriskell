/**
 * Neutraliza posibles payloads de inyección de fórmulas en hojas de cálculo (CSV Injection)
 * prefijando con apóstrofe (') cualquier celda cuyo contenido comience por
 * '=', '+', '-', '@', tabulador ('\t') o retorno de carro ('\r'),
 * incluso tras espacios o caracteres de control iniciales.
 */
export function sanitizeCsvCellValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    const numStr = String(value);
    return /^[=+\-@\t\r]/.test(numStr) ? `'${numStr}` : numStr;
  }

  const str = String(value);
  if (/^[=+\-@\t\r]/.test(str) || /^[\x00-\x20]*[=+\-@]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

/**
 * Formatea y escapa una celda para CSV (RFC 4180) aplicando protección contra inyección de fórmulas.
 */
export function formatCsvCell(value: unknown): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '""';
    if (value >= 0) return String(value);
    return `"${sanitizeCsvCellValue(value).replace(/"/g, '""')}"`;
  }
  const safeValue = sanitizeCsvCellValue(value);
  return `"${safeValue.replace(/"/g, '""')}"`;
}

/**
 * Construye una fila CSV completa terminada en salto de línea.
 */
export function formatCsvRow(cells: ReadonlyArray<unknown>): string {
  return `${cells.map(formatCsvCell).join(',')}\n`;
}
