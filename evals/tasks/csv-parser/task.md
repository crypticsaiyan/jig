`parseCsv` in src/csv.ts gets several inputs wrong. Make it follow normal CSV rules:

- fields are separated by commas
- a field may be wrapped in double quotes, and then it can contain commas and newlines
- inside a quoted field, a double quote is written as two double quotes (`""`)
- lines end with `\n` or `\r\n`
- a trailing newline at the very end does not add an empty row
