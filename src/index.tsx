import { render } from "ink";
import { App } from "./ui/App";
import { generateSystemPrompt } from "./context/system_prompt";
import { createSession, loadLatestSession } from "./session/store";
import { getContextWindow } from "./provider/model";
import { CONFIG } from "./config";
import { localTools, createRegistry } from "./tool";
import { createSubagentTool } from "./agent/subagent";
import { completeStream } from "./provider";
import { runHeadless } from "./headless";
import type { PermSession } from "./permission/types";
import { sandboxAvailable } from "./sandbox/bwrap";

const config = {
  ...CONFIG,
  contextWindow: await getContextWindow(CONFIG.loopModel, CONFIG.contextWindow),
};

const systemPrompt = await generateSystemPrompt();

const argv = process.argv;

const allowAll = argv.includes("--allow-all");
const json = argv.includes("--json"); // one JSON object on stdout, for scripts
const pIndex = argv.indexOf("-p"); // headless mode
const prompt = pIndex === -1 ? undefined : argv[pIndex + 1]; // jig -p "prompt"

const resume = argv.includes("--continue") || argv.includes("-c");
const loaded = resume ? await loadLatestSession() : undefined;

if (resume && !loaded) {
  console.error("no saved session found, starting fresh session");
} else if (resume && loaded) {
  console.error(`resuming session: ${loaded.id}`);
}

const session = loaded ?? createSession("");

const sandbox = await sandboxAvailable();
if (!sandbox) {
  console.error(
    "sandbox off: bwrap missing or blocked, so commands with pipes or redirects will ask.\n" +
      "  install: sudo pacman -S bubblewrap | sudo apt install bubblewrap | sudo dnf install bubblewrap",
  );
}
// fresh per process; the UI's allowList grows during the session
const permissions: PermSession = {
  allowList: [],
  projectRoot: process.cwd(),
  sandbox,
};

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

if (pIndex !== -1) {
  if (prompt === undefined) {
    console.error("-p needs a prompt");
    process.exit(1);
  }
  process.exit(
    await runHeadless({
      prompt,
      session,
      deps: { systemPrompt, config, tools, permissions },
      allowAll,
      json,
    }),
  );
}

render(
  <App
    systemPrompt={systemPrompt}
    session={session}
    config={config}
    tools={tools}
    permissions={permissions}
  />,
  {
    exitOnCtrlC: false,
  },
);
