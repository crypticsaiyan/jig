export function truncate(content: string, max: number): string {
  if (content.length <= max) return content;
  return (
    content.slice(0, max) +
    `\n[truncated: showing first ${max} of ${content.length} chars. Narrow the query.]`
  );
}
