import { readdir, readFile } from "node:fs/promises";
import type { SystemMessage } from "../provider";
import type { Skill } from "./types";

export const generateSystemPrompt = async (): Promise<SystemMessage> => {
  const INTRODUCTION = `You are jig, an AI coding assistant that helps the user with software engineering tasks.
`;

  const STYLE = `# STYLE:
- Be concise and direct. No filler, no praise, no restating the task.
- Reference code as path:line.
- When done, reply in plain text with no tool call. That ends your turn.
`;

  const TOOLS = `# TOOLS:
- Tool errors come back as text starting with "Error". Read them, fix the cause, then retry. Never repeat the same failing call.
- If output says [truncated] or [Tool output pruned], rerun with a narrower query.
`;

  const RULES = `# WORKING RULES:
- Read neighboring files first and match their style and libraries. Check for an existing library before adding one.
- Make minimal, focused changes. Do not refactor unrelated code.
- After editing, verify: run the typecheck, lint or tests if the project has them. Report the real result. Never claim success you did not check.
- If the request is ambiguous or the action is destructive, ask. Otherwise act.
`;

  const SAFETY = `# SAFETY:
- Never read, print or expose secrets (.env, keys, tokens).
- Never delete files or make destructive changes without approval.
- Never commit or push unless asked.
- The user may deny a tool call. If denied, do not retry it. Propose an alternative or ask.
`;

  const cwd = process.cwd();
  const platform = process.platform; // os
  const shell = process.env.SHELL ? process.env.SHELL : "undefined";
  const date = new Date().toISOString().slice(0, 10);

  const ENV = `# ENVIRONMENT:
- Working directory: ${cwd}
- Platform: ${platform}
- Shell: ${shell}
- Date: ${date}
`;

  let SKILLS = "";

  try {
    let skills: Skill[] = [];
    const skillDir = `${cwd}/.jig/skills`;
    const dirFiles = await readdir(skillDir);
    const skillFiles = dirFiles.filter((file) => file.endsWith(".md"));

    for (const file of skillFiles) {
      const content = await readFile(`${skillDir}/${file}`, "utf-8");
      const parts = content.split("---")[1];
      const name = parts?.split("\n")[1];
      const description = parts?.split("\n")[2];
      if (
        name?.split(" ")[0] != "name:" ||
        description?.split(" ")[0] != "description:"
      )
        continue;

      skills.push({
        name: name.slice(5).trim(), // content after "name:"
        description: description.slice(12).trim(), // content after "description:"
      });
    }

    SKILLS = `# SKILLS:
A skill is a specialized information you can use to do a particular task. Here is the list of skills available (use load_skill tool to load the complete skill body):
${skills.map((skill) => `${skill.name}: ${skill.description}`).join("\n")}
`;
  } catch (error) {}

  const prompt = `${INTRODUCTION}
${STYLE}
${TOOLS}
${SKILLS}
${RULES}
${SAFETY}
${ENV}
`; // env in the end for provider cache stability

  return {
    type: "system",
    content: prompt,
  };
};
