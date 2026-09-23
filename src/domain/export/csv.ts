const FORMULA_PREFIX = /^[=+\-@]/;

export function neutralizeCsvCell(value: string): string {
  return FORMULA_PREFIX.test(value) ? `'${value}` : value;
}

export function escapeCsvCell(value: string): string {
  const safeValue = neutralizeCsvCell(value);
  return /[;"\n\r]/.test(safeValue)
    ? `"${safeValue.replaceAll('"', '""')}"`
    : safeValue;
}

export function buildCsv(headers: string[], rows: string[][]): string {
  const lines = [headers, ...rows].map((row) =>
    row.map(escapeCsvCell).join(";"),
  );
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
