import { mkdir, writeFile } from "node:fs/promises";
import { workflowSkills } from "../src/workflows/skills.js";
for (const file of workflowSkills.files) {
  const dir = `skills/${file.frontmatter.name}`;
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}/SKILL.md`, file.text, "utf8");
}
console.log(`Exported ${workflowSkills.files.length} exact skill resources`);
