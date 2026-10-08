import { render } from "ink";
import { App } from "./ui/App";
import { generateSystemPrompt } from "./context/system_prompt";
import { createSession, loadLatestSession } from "./session/store";
import { getContextWindow } from "./provider/model";
import { CONFIG } from "./config";

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

render(<App systemPrompt={systemPrompt} session={session} config={config} />, {
  exitOnCtrlC: false,
});
