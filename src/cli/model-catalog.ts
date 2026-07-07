export interface CatalogModel {
  id: string;
  name: string;
  provider: string;
}

const MODELS: CatalogModel[] = [
  { id: "anthropic/claude-sonnet-5", name: "Claude Sonnet 5", provider: "Anthropic" },
  { id: "anthropic/claude-opus-4.8", name: "Claude Opus 4.8", provider: "Anthropic" },
  { id: "anthropic/claude-haiku-4", name: "Claude Haiku 4", provider: "Anthropic" },
  { id: "openai/gpt-5.5", name: "GPT 5.5", provider: "OpenAI" },
  { id: "openai/gpt-5", name: "GPT 5", provider: "OpenAI" },
  { id: "openai/gpt-4.5", name: "GPT 4.5", provider: "OpenAI" },
  { id: "openai/gpt-4o", name: "GPT 4o", provider: "OpenAI" },
  { id: "openai/o3", name: "o3", provider: "OpenAI" },
  { id: "openai/o4-mini", name: "o4-mini", provider: "OpenAI" },
  { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "Google" },
  { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "Google" },
  { id: "google/gemini-2.0-flash", name: "Gemini 2.0 Flash", provider: "Google" },
  { id: "meta/llama-4", name: "Llama 4", provider: "Meta" },
  { id: "meta/llama-3.3-70b", name: "Llama 3.3 70B", provider: "Meta" },
  { id: "meta/llama-3.1-405b", name: "Llama 3.1 405B", provider: "Meta" },
  { id: "mistral/mistral-large-4", name: "Mistral Large 4", provider: "Mistral" },
  { id: "mistral/mistral-small-4", name: "Mistral Small 4", provider: "Mistral" },
  { id: "deepseek/deepseek-v4", name: "DeepSeek V4", provider: "DeepSeek" },
  { id: "deepseek/deepseek-r1", name: "DeepSeek R1", provider: "DeepSeek" },
  { id: "groq/llama-3.3-70b-versatile", name: "Llama 3.3 70B Versatile", provider: "Groq" },
  { id: "groq/llama-3.1-8b-instant", name: "Llama 3.1 8B Instant", provider: "Groq" },
];

export async function fetchModelCatalog(): Promise<CatalogModel[]> {
  await new Promise((r) => setTimeout(r, 600 + Math.random() * 400));
  return MODELS;
}