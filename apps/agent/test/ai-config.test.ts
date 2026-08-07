import { describe, it, expect } from "vitest";
import { resolveAiConfig, buildModel, DEFAULT_MODEL_ID } from "../src/agent/ai-config";

describe("resolveAiConfig", () => {
  it("usa o modelo e a chave da plataforma no modo nossa", () => {
    const cfg = resolveAiConfig("nossa", "chave-da-plataforma");
    expect(cfg.modelId).toBe(DEFAULT_MODEL_ID);
    expect(cfg.apiKey).toBe("chave-da-plataforma");
  });

  it("na fase 1 o modo byo ainda cai na chave da plataforma", () => {
    const cfg = resolveAiConfig("byo", "chave-da-plataforma");
    expect(cfg.apiKey).toBe("chave-da-plataforma");
  });
});

describe("buildModel", () => {
  it("monta um modelo com o id pedido", () => {
    const model = buildModel({ modelId: DEFAULT_MODEL_ID, apiKey: "k" });
    expect(model).toBeDefined();
    expect(model.modelId).toBe(DEFAULT_MODEL_ID);
  });
});
