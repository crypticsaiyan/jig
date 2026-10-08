import type { LoopConfig } from "./loop/types";

export const CONFIG: LoopConfig = {
  maxIterations: 20,
  maxTokens: 200000,
  contextWindow: 128000,
  maxPruneAllowanceRatio: 0.1,
  compactionRatio: 0.9,
  pruneRatio: 0.5,
  loopModel: "openai/gpt-oss-120b",
  compactionModel: "openrouter/free",
  transcriptCapChars: 2000,
};

export const TOOLS = {
  maxOutputChars: 2000, // cap per string field of a tool result
  readFileDefaultLimit: 2000, // lines read_file returns when no limit is given
};

// project-local storage
const JIG_DIR = `${process.cwd()}/.jig`;
export const PATHS = {
  skillsDir: `${JIG_DIR}/skills`,
  sessionsDir: `${JIG_DIR}/sessions`,
};

// display only
export const UI = {
  titleMaxChars: 50, // session title taken from the first message
  reasoningTailChars: 300, // live reasoning shows only its tail
  toolSummaryChars: 60, // tool line argument summary
};
