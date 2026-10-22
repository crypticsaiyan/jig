// parses CSV text into rows of fields
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  for (const line of text.split("\n")) {
    if (line === "") continue;
    const fields: string[] = [];
    let field = "";
    let quoted = false;
    for (const ch of line) {
      if (ch === '"') {
        quoted = !quoted;
      } else if (ch === "," && !quoted) {
        fields.push(field);
        field = "";
      } else {
        field += ch;
      }
    }
    if (field !== "") fields.push(field);
    rows.push(fields);
  }
  return rows;
}
