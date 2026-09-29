import type { AgentMessage } from "../provider";
import { complete } from "../provider";
import { runLoop } from "./loop";
import type { Session } from "../session";
import { generateSystemPrompt } from "../context/system_prompt";

const messages: AgentMessage[] = [
  {
    type: "user",
    content:
      "run seq 1 5000. I need the first 1000 values. then make a folder named test run. make a file containing boilerplate c code then a file containing boilerplate js code.",
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

const systemPrompt = generateSystemPrompt();

const result = await runLoop({
  messages,
  complete,
  config: {
    maxIterations: 20,
    maxTokens: 20000,
    contextWindow: 20000,

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

console.log(
  "============================ THIS IS THE FINAL RESULT OF THE LOOP CALL ===============================================",
);
console.dir(result, { depth: null });
