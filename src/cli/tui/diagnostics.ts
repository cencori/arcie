import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { grey, dim, yellow, green } from "../style";

export interface Diagnostic {
  severity: "info" | "warn" | "error";
  message: string;
  fix?: string;
}

const PROVIDER_KEY_MAP: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  groq: "GROQ_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  mistral: "MISTRAL_API_KEY",
  google: "GOOGLE_API_KEY",
  meta: "TOGETHER_API_KEY",
};

export function providerEnvVar(modelId: string): { provider: string; envVar: string } | undefined {
  const provider = modelId.split("/")[0];
  if (!provider) return undefined;
  const envVar = PROVIDER_KEY_MAP[provider];
  return envVar ? { provider, envVar } : undefined;
}

export function isProviderKeySet(agentDir: string, envVar: string): boolean {
  if (process.env[envVar] && process.env[envVar] !== "") return true;
  const envPath = join(agentDir, "..", ".env.local");
  if (!existsSync(envPath)) return false;
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith(`${envVar}=`) && !trimmed.startsWith(`#`)) return true;
  }
  return false;
}

export function checkProviderKeys(agentDir: string, modelId: string): Diagnostic[] {
  const results: Diagnostic[] = [];

  const info = providerEnvVar(modelId);
  if (info === undefined) return results;
  const { provider, envVar } = info;

  const envPath = join(agentDir, "..", ".env.local");
  let hasKey = false;

  if (existsSync(envPath)) {
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith(`${envVar}=`) && !trimmed.startsWith(`#`)) {
        hasKey = true;
        break;
      }
    }
  }

  const inProcess = process.env[envVar] && process.env[envVar] !== "";

  if (!hasKey && !inProcess) {
    results.push({
      severity: "warn",
      message: `Missing ${envVar} for provider: ${provider}`,
      fix: `Add ${envVar}=your_key_here to .env.local`,
    });
  } else {
    results.push({
      severity: "info",
      message: `${envVar} is configured`,
    });
  }

  return results;
}

export function printDiagnostics(diagnostics: Diagnostic[]): void {
  for (const d of diagnostics) {
    const icon = d.severity === "error" ? yellow("\u26A0")
      : d.severity === "warn" ? yellow("\u26A0")
      : grey("\u2713");
    const msg = d.severity === "error" ? yellow(d.message)
      : d.severity === "warn" ? yellow(d.message)
      : grey(d.message);
    console.log(`  ${icon} ${msg}`);
    if (d.fix) {
      console.log(`    ${dim(d.fix)}`);
    }
  }
}
