import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";
import { fetchModelCatalog, type CatalogModel } from "./model-catalog";
import { checkProviderKeys, isProviderKeySet, providerEnvVar } from "./tui/diagnostics";
import { createTuiPrompter } from "./setup/tui-prompter";
import type { Prompter } from "./setup/prompter";
import { scaffoldWebChat } from "./scaffold-web-chat";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Walk up from the current file to find the installed package's `templates/`
 * directory. Bundlers (tsup) may collapse `src/cli/init.ts` into a flat
 * `dist/*.js`, so `../../templates` from the source file is not a reliable
 * post-build path. The templates directory always sits at the package root
 * regardless of where the bundle lands.
 */
function resolveTemplatesDir(): string {
  let current = __dirname;
  for (let i = 0; i < 6; i += 1) {
    const candidate = resolve(current, "templates");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return resolve(__dirname, "../../templates");
}

const TEMPLATES_DIR = resolveTemplatesDir();

function copyTemplate(src: string, dest: string): void {
  for (const entry of collectFiles(src)) {
    const relative = entry.replace(src, "").replace(/^\//, "");
    const destPath = join(dest, relative);
    if (entry.endsWith(".gitkeep")) {
      const parentDir = destPath.replace("/.gitkeep", "");
      mkdirSync(parentDir, { recursive: true });
      writeFileSync(join(parentDir, ".gitkeep"), "");
      continue;
    }
    mkdirSync(dirname(destPath), { recursive: true });
    copyFileSync(entry, destPath);
  }
}

function collectFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) results.push(...collectFiles(full));
    else results.push(full);
  }
  return results;
}

function updatePackageJson(dir: string, name: string): void {
  const pkgPath = join(dir, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  pkg.name = name;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
}

function detectEnvKey(): string | null {
  return process.env.CENCORI_API_KEY ?? null;
}

function uncommentEnvLine(envPath: string, key: string, value: string): void {
  const content = readFileSync(envPath, "utf-8");
  const lines = content.split("\n");
  const updated = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith(`# ${key}=`) || trimmed.startsWith(`${key}=`)) {
      return `${key}=${value}`;
    }
    return line;
  });
  if (updated.join("\n") === content) updated.push(`${key}=${value}`);
  writeFileSync(envPath, updated.join("\n") + "\n");
}

function writeAgentModel(agentDir: string, model: string): void {
  const agentFile = join(agentDir, "agent/agent.ts");
  const content = readFileSync(agentFile, "utf-8");
  const updated = content.replace(/model:\s*"[^"]+"/, `model: "${model}"`);
  writeFileSync(agentFile, updated);
}

function runNpmInstall(cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = exec("npm install", { cwd });
    proc.once("exit", (code) => (code === 0 ? resolve() : reject(new Error(`npm exit ${code}`))));
    proc.once("error", reject);
  });
}

const IGNORED_DIRECTORY_ENTRIES = new Set([".DS_Store", ".git", ".gitkeep"]);

function directoryHasMeaningfulContent(dir: string): boolean {
  try {
    return readdirSync(dir).some((entry) => !IGNORED_DIRECTORY_ENTRIES.has(entry));
  } catch {
    return false;
  }
}

function looksLikeArcieProject(dir: string): boolean {
  return existsSync(join(dir, "agent", "agent.ts"));
}

/**
 * Refuses to wipe a directory that is not clearly the user's project scratch
 * space. Blocks the root, the user's home, first-level system paths, and
 * anything with fewer than two non-root segments so an operator can't
 * accidentally rm-rf `/tmp` by giving init a slightly wrong argument.
 */
function assertSafeToClear(dir: string): void {
  const absolute = resolve(dir);
  const home = homedir();
  if (absolute === "/" || absolute === home) {
    throw new Error(`Refusing to clear ${absolute}: too dangerous`);
  }
  const parts = absolute.split("/").filter((part) => part.length > 0);
  if (parts.length < 2) {
    throw new Error(`Refusing to clear ${absolute}: not enough path depth`);
  }
  const dangerousFirst = new Set(["etc", "var", "usr", "bin", "sbin", "System", "Library"]);
  if (parts.length === 2 && dangerousFirst.has(parts[0]!)) {
    throw new Error(`Refusing to clear ${absolute}: system path`);
  }
}

function clearDirectoryContents(dir: string): void {
  assertSafeToClear(dir);
  for (const entry of readdirSync(dir)) {
    rmSync(join(dir, entry), { recursive: true, force: true });
  }
}

export async function initCommand(
  name: string | undefined,
  options: { template: string },
): Promise<void> {
  const targetDir = name ? resolve(process.cwd(), name) : resolve(process.cwd(), ".");

  const templateDir = resolve(TEMPLATES_DIR, options.template);
  if (!existsSync(templateDir)) {
    console.error(`  Template not found: ${options.template}`);
    process.exit(1);
  }

  const prompter = createTuiPrompter();
  try {
    let mode: InitMode = "fresh";
    if (existsSync(targetDir) && directoryHasMeaningfulContent(targetDir)) {
      const decision = await resolveExistingDirectory(prompter, targetDir);
      if (decision === "cancel") return;
      if (decision === "overwrite") {
        try {
          clearDirectoryContents(targetDir);
          prompter.log.warning(`Cleared ${targetDir}`);
        } catch (err) {
          prompter.log.error(err instanceof Error ? err.message : String(err));
          return;
        }
      } else {
        mode = "resume";
      }
    }
    await runInit(prompter, { targetDir, templateDir, name, mode });
  } finally {
    prompter.stop();
  }
}

async function maybeScaffoldWebChat(prompter: Prompter, targetDir: string): Promise<void> {
  const choice = await prompter.select({
    message: "Add a web chat UI now? (Next.js + shadcn under channels/web)",
    options: [
      { value: "yes", label: "Yes — scaffold channels/web now" },
      { value: "no", label: "No — I'll add it later with `arcie channels add web`" },
    ],
  });
  if (choice !== "yes") return;

  try {
    const result = scaffoldWebChat(targetDir);
    if (result.alreadyExisted) {
      prompter.log.info(`channels/web already exists — left it untouched`);
      return;
    }
    prompter.log.success(`Scaffolded ${result.targetPath}`);
    prompter.section("Next steps", [
      `cd ${result.targetPath.replace(process.cwd() + "/", "")}`,
      "npm install",
      "cp .env.local.example .env.local",
      "npm run dev",
    ]);
  } catch (err) {
    prompter.log.error(err instanceof Error ? err.message : String(err));
  }
}

async function maybePromptProviderKey(
  prompter: Prompter,
  targetDir: string,
  modelId: string,
): Promise<void> {
  if (process.env.CENCORI_API_KEY) return;
  const info = providerEnvVar(modelId);
  if (info === undefined) return;
  if (isProviderKeySet(targetDir, info.envVar)) return;

  const key = await prompter.text({
    message: `Paste your ${info.envVar} for ${info.provider} (optional — skip with Enter)`,
    mask: true,
  });
  if (key === undefined || key.length === 0) return;

  const envPath = join(targetDir, ".env.local");
  uncommentEnvLine(envPath, info.envVar, key);
  process.env[info.envVar] = key;
  prompter.log.success(`Wrote ${info.envVar} to .env.local`);
}

type InitMode = "fresh" | "resume";
type ExistingDirectoryDecision = "overwrite" | "resume" | "cancel";

async function resolveExistingDirectory(
  prompter: Prompter,
  targetDir: string,
): Promise<ExistingDirectoryDecision> {
  const looksArcie = looksLikeArcieProject(targetDir);
  const message = looksArcie
    ? `${targetDir} already contains an arcie project.`
    : `${targetDir} is not empty.`;
  const options = looksArcie
    ? ([
        {
          value: "resume" as const,
          label: "Resume — keep files, reconfigure model + API key",
        },
        {
          value: "overwrite" as const,
          label: "Overwrite — delete existing files and scaffold fresh",
        },
        { value: "cancel" as const, label: "Cancel" },
      ])
    : ([
        {
          value: "overwrite" as const,
          label: "Overwrite — delete existing files and scaffold fresh",
        },
        {
          value: "resume" as const,
          label: "Keep existing files and reconfigure",
        },
        { value: "cancel" as const, label: "Cancel" },
      ]);
  const choice = await prompter.select({ message, options });
  return choice ?? "cancel";
}

async function runInit(
  prompter: Prompter,
  input: { targetDir: string; templateDir: string; name: string | undefined; mode: InitMode },
): Promise<void> {
  const { targetDir, templateDir, name, mode } = input;

  const needsScaffold = mode === "fresh" || !looksLikeArcieProject(targetDir);
  if (needsScaffold) {
    const scaffold = prompter.spinner(`Creating agent in ${targetDir}`);
    copyTemplate(templateDir, targetDir);
    if (name) updatePackageJson(targetDir, name);
    scaffold.stop({ kind: "success", message: `Created agent in ${targetDir}` });
  } else {
    prompter.log.info(`Resuming setup for ${targetDir}`);
  }

  const nodeModules = join(targetDir, "node_modules");
  if (existsSync(nodeModules)) {
    prompter.log.info("Dependencies already installed");
  } else {
    const install = prompter.spinner("Installing dependencies");
    try {
      await runNpmInstall(targetDir);
      install.stop({ kind: "success", message: "Installed dependencies" });
    } catch {
      install.stop({ kind: "warning", message: "Dependency install skipped" });
    }
  }

  if (detectEnvKey() === null) {
    const key = await prompter.text({
      message: "Paste your CENCORI_API_KEY (optional — skip with Enter)",
      mask: true,
    });
    if (key !== undefined && key.length > 0) {
      uncommentEnvLine(join(targetDir, ".env.local"), "CENCORI_API_KEY", key);
      process.env.CENCORI_API_KEY = key;
      prompter.log.success("Wrote CENCORI_API_KEY to .env.local");
    }
  }

  const catalogSpinner = prompter.spinner("Loading model catalog");
  const catalog = await fetchModelCatalog();
  catalogSpinner.stop();

  const modelId = await prompter.searchableSelect({
    message: "What model would you like to use?",
    placeholder: "type to filter…",
    options: catalog.map((model: CatalogModel) => ({
      value: model.id,
      label: model.name,
      description: model.provider,
    })),
  });
  if (modelId === undefined) return;
  writeAgentModel(targetDir, modelId);
  prompter.log.success(`Set model to ${modelId}`);

  await maybePromptProviderKey(prompter, targetDir, modelId);

  const diagnostics = checkProviderKeys(targetDir, modelId);
  if (diagnostics.length > 0) {
    prompter.section(
      "Checks",
      diagnostics.map(
        (d) => `${d.severity === "info" ? "✓" : "⚠"} ${d.message}${d.fix ? ` — ${d.fix}` : ""}`,
      ),
    );
  }

  await maybeScaffoldWebChat(prompter, targetDir);

  const start = await prompter.select({
    message: "Start dev server now?",
    options: [
      { value: "yes", label: "Yes — arcie dev + web UI, browser opens" },
      { value: "no", label: `No — later: cd ${name ?? "."} && arcie dev` },
    ],
  });
  if (start !== "yes") {
    prompter.log.info(`later: cd ${name ?? "."} && arcie dev`);
    return;
  }

  const { devCommand } = await import("./dev");
  prompter.stop();
  await devCommand({ port: "3000", agentDir: targetDir, input: false });
}
