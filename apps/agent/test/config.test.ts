import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config";

const baseEnv = {
  EVOLUTION_API_URL: "https://api.evolution.example.com",
  EVOLUTION_INSTANCE: "instance-id",
  EVOLUTION_API_KEY: "api-key",
  GOOGLE_GENERATIVE_AI_API_KEY: "google-key",
  DATABASE_URL: "postgresql://localhost/test",
};

describe("loadConfig", () => {
  it("sem SUBSCRIPTIONS_ENABLED retorna false", () => {
    const config = loadConfig(baseEnv);
    expect(config.subscriptionsEnabled).toBe(false);
  });

  it("com SUBSCRIPTIONS_ENABLED vazio nao lanca e retorna false", () => {
    const config = loadConfig({ ...baseEnv, SUBSCRIPTIONS_ENABLED: "" });
    expect(config.subscriptionsEnabled).toBe(false);
  });

  it("com SUBSCRIPTIONS_ENABLED=TRUE nao lanca e retorna false", () => {
    const config = loadConfig({ ...baseEnv, SUBSCRIPTIONS_ENABLED: "TRUE" });
    expect(config.subscriptionsEnabled).toBe(false);
  });

  it("com SUBSCRIPTIONS_ENABLED=1 nao lanca e retorna false", () => {
    const config = loadConfig({ ...baseEnv, SUBSCRIPTIONS_ENABLED: "1" });
    expect(config.subscriptionsEnabled).toBe(false);
  });

  it("com SUBSCRIPTIONS_ENABLED=true retorna true", () => {
    const config = loadConfig({ ...baseEnv, SUBSCRIPTIONS_ENABLED: "true" });
    expect(config.subscriptionsEnabled).toBe(true);
  });

  it("BILLING_URL usa default quando nao fornecida", () => {
    const config = loadConfig(baseEnv);
    expect(config.billingUrl).toBe("https://pilinha.com.br/precos");
  });
});
