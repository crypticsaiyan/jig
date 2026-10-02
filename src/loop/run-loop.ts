import type { AgentMessage } from "../provider";
import { completeStream } from "../provider";
import { runLoop } from "./loop";
import type { Session } from "../session";
import { generateSystemPrompt } from "../context/system_prompt";

const messages: AgentMessage[] = [
  {
    type: "user",
    content: "what is the meaning of life",
  },
];

const session: Session = {
  permissions: {
    allowList: [],
    projectRoot: process.cwd(),
  },
};

const controller = new AbortController();

process.on("SIGINT", () => {
  if (controller.signal.aborted) process.exit(130);
  controller.abort();
  console.log("band kro");
});

const systemPrompt = await generateSystemPrompt();

const result = await runLoop({
  messages,
  complete: completeStream,
  config: {
    maxIterations: 20,
    maxTokens: 200000,
    contextWindow: 128000,

    systemPrompt,
    maxPruneAllowanceRatio: 0.1,
    compactionRatio: 0.9,
    pruneRatio: 0.5,
    loopModel: "openrouter/free",
    compactionModel: "openrouter/free",
    transcriptCapChars: 2000,
  },
  ctx: {
    session,
    asker: async () => "allow-once",
    signal: controller.signal,
    maxOutputChars: 2000,
  },
});
