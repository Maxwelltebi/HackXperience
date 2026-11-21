/** A CSV cell. Numbers are written as they are; null is an empty cell. */
export type CsvCell = string | number | null;

/**
 * RFC 4180 CSV with CRLF line ends. Text that a spreadsheet would run as a formula (starting
 * with =, +, -, @, tab or carriage return) gets a leading apostrophe: report values such as
 * school names come from applicants (CSV injection).
 */
export function toCsv(rows: readonly (readonly CsvCell[])[]): string {
  return rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}

function cell(value: CsvCell): string {
  if (value === null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) || safe !== safe.trim() ? `"${safe.replace(/"/g, '""')}"` : safe;
}
