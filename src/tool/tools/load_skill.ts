import { z } from "zod";
import type { Tool } from "../types";
import { readFile } from "node:fs/promises";

export const loadSkill: Tool<
  { skillName: z.ZodString },
  { skillBody: string }
> = {
  name: "load_skill",
  description: "Load the body of a skill through the skill name.",
  parameters: z.object({
    skillName: z.string().describe("name of the skill to load"),
  }),
  getPermissionKey: () => undefined,
  execute: async ({ skillName }) => {
    try {
      if (
        skillName.includes(".") ||
        skillName.includes("\\") ||
        skillName.includes("/")
      )
        throw new Error("invalid skill name");
      const skillPath = `${process.cwd()}/.jig/skills/${skillName}.md`;
      const skillContent = await readFile(skillPath, "utf-8");
      const skillBody = skillContent.split("---")[2]?.trim();
      if (!skillBody) return { skillBody: "No content in skill body" };
      return { skillBody };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Error reading skill "${skillName}": ${error.message}`);
      }
      throw new Error(`Error reading skill "${skillName}"`);
    }
  },
};
