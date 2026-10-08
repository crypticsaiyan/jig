import type { LoopState } from "../loop/types";

export type Session = {
  version: number;
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  state: LoopState | undefined;
};
