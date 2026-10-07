import type { LoopState } from "../loop/types";

export type Session = {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  state: LoopState | undefined;
};
