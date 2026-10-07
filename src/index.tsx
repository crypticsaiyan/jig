import { render } from "ink";
import { App } from "./ui/App";
import { generateSystemPrompt } from "./context/system_prompt";

const systemPrompt = await generateSystemPrompt();

render(<App systemPrompt={systemPrompt} />, { exitOnCtrlC: false });
