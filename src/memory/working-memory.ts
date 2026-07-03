import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { z } from "zod";
import type { MemoryStore, MemoryStrategy } from "./types";
import type { ToolConfig } from "../types";

const updateWorkingMemorySchema = z.object({
  section: z.string().describe("The markdown section heading to update (e.g. 'Interests', 'Goals')"),
  content: z.string().describe("The new bullet-list content for the section"),
});

export const DEFAULT_TEMPLATE = `# User Profile

- **Name**:
- **Interests**:
- **Goals**:
- **Preferences**:
`;

export const WORKING_MEMORY_SYSTEM_INSTRUCTION = `You have access to a persistent working memory that stores information about the user.
You can read the current working memory below and update it using the \`updateWorkingMemory\` tool.

When the user tells you something about themselves, update the working memory to reflect it.
Use the \`updateWorkingMemory\` tool with \`section\` set to the markdown heading (e.g. "Interests") and \`content\` set to the new bullet list content for that section.`;

export class WorkingMemory implements MemoryStrategy {
  private template: string;
  private content: string;
  private baseDir: string;
  private resourceId: string;
  private initialized = false;

  constructor(template?: string, baseDir?: string, resourceId?: string) {
    this.template = template ?? DEFAULT_TEMPLATE;
    this.content = this.template;
    this.resourceId = resourceId ?? "default";
    this.baseDir = baseDir ?? resolve(homedir(), ".arcie", "memory", "working");
  }

  private ensureDir(): void {
    if (!this.initialized) {
      mkdirSync(this.baseDir, { recursive: true });
      this.initialized = true;
    }
  }

  private filePath(resourceId: string): string {
    return resolve(this.baseDir, `${resourceId}.md`);
  }

  private loadFromDisk(resourceId: string): void {
    this.ensureDir();
    const path = this.filePath(resourceId);
    if (existsSync(path)) {
      this.content = readFileSync(path, "utf-8");
    } else {
      this.content = this.template;
    }
  }

  private saveToDisk(resourceId: string): void {
    this.ensureDir();
    writeFileSync(this.filePath(resourceId), this.content, "utf-8");
  }

  getSystemInstruction(): string {
    return WORKING_MEMORY_SYSTEM_INSTRUCTION;
  }

  getCurrentContent(resourceId: string): string {
    this.loadFromDisk(resourceId);
    return this.content;
  }

  updateSection(resourceId: string, section: string, content: string): void {
    this.loadFromDisk(resourceId);

    const sectionRegex = new RegExp(`(##\\s*${escapeRegex(section)}[\\s\\S]*?)(?=\\n##\\s|\\n*$)`, "i");
    const existing = this.content.match(sectionRegex);

    if (existing) {
      const headerMatch = existing[0].match(/^##\s+.+$/m);
      const header = headerMatch ? headerMatch[0] : `## ${section}`;
      this.content = this.content.replace(existing[0], `${header}\n\n${content}\n`);
    } else {
      this.content += `\n## ${section}\n\n${content}\n`;
    }

    this.saveToDisk(resourceId);
  }

  getToolDefinitions(): Record<string, ToolConfig> {
    const resourceId = this.resourceId;
    return {
      updateWorkingMemory: {
        description: "Update a section of the working memory with new content. Use this when the user shares personal information.",
        inputSchema: updateWorkingMemorySchema,
        execute: async (input: unknown) => {
          const { section, content } = input as { section: string; content: string };
          this.updateSection(resourceId, section, content);
          return { updated: true, section };
        },
      },
    };
  }

  async getInputContext(_store: MemoryStore, resourceId: string, _threadId: string): Promise<string> {
    this.loadFromDisk(resourceId);
    if (!this.content || this.content === this.template) return "";
    return `## Working Memory (persistent — edit ~/.arcie/memory/working/${resourceId}.md directly)\n\n${this.content}`;
  }

  async recordTurn(
    _store: MemoryStore,
    _resourceId: string,
    _threadId: string,
    _input: string,
    _output: string,
    _toolCalls?: { tool: string; input: unknown; output: unknown }[],
  ): Promise<void> {
    // Working memory is updated via tool calls, not automatically
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
