/**
 * Minimal, dependency-free CSV serialization for admin exports. Not a
 * general-purpose CSV parser/writer — just enough to safely turn arrays of
 * flat objects into a downloadable file (handles commas, quotes, newlines,
 * and Excel's need for a UTF-8 BOM to display accented characters right).
 */

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = value instanceof Date ? value.toISOString() : String(value);
  if (/[",\n;]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv<T extends Record<string, unknown>>(rows: T[], columns: (keyof T & string)[]): string {
  const header = columns.join(",");
  const lines = rows.map((row) => columns.map((col) => escapeCsvCell(row[col])).join(","));
  // UTF-8 BOM so Excel (still the most likely consumer of an admin export)
  // renders é/è/à correctly instead of guessing the wrong encoding.
  return "\uFEFF" + [header, ...lines].join("\n");
}

export function csvResponse(filename: string, csv: string): Response {
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
