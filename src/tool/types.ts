import type { z, ZodRawShape } from "zod";
import type { RunContext } from "../loop/types";
import type { PermKey } from "../permission/types";
import type { ToolSpec } from "../provider";

export type Tool<
  TParams extends ZodRawShape = ZodRawShape,
  TResult = unknown,
> = {
  name: string;
  description: string;
  parameters: z.ZodObject<TParams>;
  getPermissionKey: (
    args: z.infer<z.ZodObject<TParams>>,
  ) => PermKey | undefined;
  execute: (
    args: z.infer<z.ZodObject<TParams>>,
    ctx: RunContext,
  ) => Promise<TResult>;
};

export type Registry = {
  specs: ToolSpec[];
  run: (name: string, args: string, ctx: RunContext) => Promise<string>;
};
