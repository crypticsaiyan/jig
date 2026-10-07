export type Item =
  | { id: number; kind: "banner" }
  | { id: number; kind: "user" | "assistant" | "error"; text: string }
  | { id: number; kind: "tool"; name: string; summary: string; ok: boolean };
