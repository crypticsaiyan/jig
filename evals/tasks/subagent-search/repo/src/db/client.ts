export function connect(url: string): { url: string } {
  // TODO: retry when the database is down
  return { url };
}

export function query(sql: string): string[] {
  // TODO: escape parameters
  return [sql];
}
