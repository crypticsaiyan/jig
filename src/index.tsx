import { render } from "ink";
import { App } from "./ui/App";
import { generateSystemPrompt } from "./context/system_prompt";
import { createSession, loadLatestSession } from "./session/store";
import { getContextWindow } from "./provider/model";
import { CONFIG } from "./config";
import { localTools, createRegistry } from "./tool";
import { createSubagentTool } from "./agent/subagent";
import { completeStream } from "./provider";

const config = {
  ...CONFIG,
  contextWindow: await getContextWindow(CONFIG.loopModel, CONFIG.contextWindow),
};

const systemPrompt = await generateSystemPrompt();

const resume = process.argv.includes("--continue");
const loaded = resume ? await loadLatestSession() : undefined;

if (resume && !loaded) {
  console.log("no saved session found, starting fresh session");
} else if (resume && loaded) {
  console.log(`resuming session: ${loaded.id}`);
}

const session = loaded ?? createSession("");

const childTools = createRegistry(localTools);

const tools = createRegistry([
  ...localTools,
  createSubagentTool({
    complete: completeStream,
    config,
    tools: childTools,
    systemPrompt,
  }),
]);

render(
  <App
    systemPrompt={systemPrompt}
    session={session}
    config={config}
    tools={tools}
  />,
  {
    exitOnCtrlC: false,
  },
);
