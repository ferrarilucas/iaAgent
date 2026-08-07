import { createGoogleGenerativeAI, type GoogleGenerativeAIProvider } from "@ai-sdk/google";

export const DEFAULT_MODEL_ID = "gemini-flash-latest";

export type AiConfig = { modelId: string; apiKey?: string };

export function resolveAiConfig(aiMode: "nossa" | "byo", platformKey: string): AiConfig {
  return { modelId: DEFAULT_MODEL_ID, apiKey: platformKey };
}

export function buildModel(cfg: AiConfig): ReturnType<GoogleGenerativeAIProvider> {
  const provider = createGoogleGenerativeAI({ apiKey: cfg.apiKey });
  return provider(cfg.modelId);
}
