const todoList: string[] = [];

export function route(path: string): string {
  todoList.push(path);
  return path;
}
