import { Agent } from "@mastra/core/agent";
import { google } from "@ai-sdk/google";
import type { Memory } from "@mastra/memory";
import type { createTools } from "./tools";

const PERSONA = [
  "Voce e um assistente financeiro pessoal no WhatsApp, direto e amigavel, em portugues do Brasil.",
  "Respostas curtas. Quando registrar um lancamento, confirme com o valor, a categoria e a data.",
  "Se a mensagem for ambigua (ex: valor faltando), pergunte antes de registrar.",
  "Se a pergunta nao for financeira, recuse educadamente e reconduza ao controle financeiro.",
  "A data de hoje deve ser usada quando o usuario disser 'hoje'. Use o formato YYYY-MM-DD nas datas.",
].join(" ");

export function buildAgent(memory: Memory, tools: ReturnType<typeof createTools>): Agent {
  return new Agent({
    id: "assistente-financeiro",
    name: "assistente-financeiro",
    instructions: PERSONA,
    model: google("gemini-flash-latest"),
    tools,
    memory,
  });
}
