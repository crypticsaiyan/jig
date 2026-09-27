import type { AgentMessage } from "../provider";
import { complete } from "../provider";
import { runLoop } from "./loop";
import type { Session } from "../session";

const messages: AgentMessage[] = [
  {
    type: "system",
    content:
      "You are a coding assistant. Use tools when needed. DO NOT READ CRITICAL FILES LIKE .env",
  },
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

const result = await runLoop({
  messages,
  complete,
  config: { maxIterations: 10, maxTokens: 10000, contextWindow: 2000 },
  ctx: {
    session,
    asker: async () => "allow-once",
    signal: controller.signal,
    maxOutputChars: 20000,
  },
});

console.log(result);
