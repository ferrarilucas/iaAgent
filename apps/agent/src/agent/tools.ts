import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import type { Db } from "@ia/db";
import {
  insertTransactions,
  listTransactionsForSpace,
  sumByCategory,
  findCategoryByName,
  getLastTransactionForUser,
  updateTransaction,
  deleteTransaction,
  CATEGORY_NAMES,
} from "@ia/db";

export const itemSchema = z.object({
  type: z.enum(["despesa", "receita"]),
  amount: z.string(),
  categoria: z.enum(CATEGORY_NAMES),
  description: z.string().optional(),
  occurredAt: z.string(),
  source: z.enum(["texto", "audio", "foto", "video", "pdf"]),
});

async function resolveCategoria(db: Db, spaceId: string, nome: string, type: "despesa" | "receita") {
  const found = await findCategoryByName(db, spaceId, nome, type);
  if (found) return found.id;
  const fallback = await findCategoryByName(db, spaceId, "outros", type);
  return fallback?.id;
}

export async function registrarTransacaoImpl(
  db: Db,
  input: { userId: string; spaceId: string; itens: Array<z.infer<typeof itemSchema>> },
): Promise<{ criadas: number }> {
  const inputs = [];
  for (const it of input.itens) {
    const categoryId = await resolveCategoria(db, input.spaceId, it.categoria, it.type);
    inputs.push({
      createdBy: input.userId,
      type: it.type,
      amount: it.amount,
      categoryId,
      description: it.description,
      occurredAt: it.occurredAt,
      source: it.source,
    });
  }
  const rows = await insertTransactions(db, inputs);
  return { criadas: rows.length };
}

export async function consultarImpl(
  db: Db,
  input: { spaceId: string; from?: string; to?: string; type?: "despesa" | "receita" },
) {
  const rows = await listTransactionsForSpace(db, input.spaceId, { from: input.from, to: input.to, type: input.type });
  return { itens: rows.map((r) => ({ amount: r.amount, occurredAt: r.occurredAt, description: r.description })) };
}

export async function resumoImpl(
  db: Db,
  input: { spaceId: string; from: string; to: string; type: "despesa" | "receita" },
): Promise<{ total: string; porCategoria: Array<{ categoryId: string | null; total: string }> }> {
  const porCategoria = await sumByCategory(db, input.spaceId, { from: input.from, to: input.to, type: input.type });
  const total = porCategoria.reduce((acc, r) => acc + Number(r.total), 0).toFixed(2);
  return { total, porCategoria };
}

export async function corrigirUltimaImpl(
  db: Db,
  input: { userId: string; spaceId: string; type?: "despesa" | "receita"; amount?: string; categoria?: string; description?: string; occurredAt?: string },
): Promise<{ ok: boolean }> {
  const last = await getLastTransactionForUser(db, input.userId);
  if (!last) return { ok: false };
  const patch: Record<string, unknown> = {};
  if (input.amount) patch.amount = input.amount;
  if (input.description) patch.description = input.description;
  if (input.occurredAt) patch.occurredAt = input.occurredAt;
  if (input.type) patch.type = input.type;
  if (input.categoria) {
    const categoryId = await resolveCategoria(db, input.spaceId, input.categoria, input.type ?? last.type);
    patch.categoryId = categoryId;
  }
  await updateTransaction(db, last.id, patch);
  return { ok: true };
}

export async function apagarUltimaImpl(db: Db, input: { userId: string }): Promise<{ ok: boolean }> {
  const last = await getLastTransactionForUser(db, input.userId);
  if (!last) return { ok: false };
  await deleteTransaction(db, last.id);
  return { ok: true };
}

export function createTools(db: Db, userId: string, spaceId: string) {
  return {
    registrar_transacao: createTool({
      id: "registrar_transacao",
      description: "Registra um ou mais lancamentos financeiros (despesa ou receita).",
      inputSchema: z.object({ itens: z.array(itemSchema) }),
      execute: async (inputData) => registrarTransacaoImpl(db, { userId, spaceId, itens: inputData.itens }),
    }),
    consultar_transacoes: createTool({
      id: "consultar_transacoes",
      description: "Lista lancamentos do espaco com filtros opcionais de periodo e tipo.",
      inputSchema: z.object({
        from: z.string().optional(),
        to: z.string().optional(),
        type: z.enum(["despesa", "receita"]).optional(),
      }),
      execute: async (inputData) => consultarImpl(db, { spaceId, ...inputData }),
    }),
    resumo: createTool({
      id: "resumo",
      description: "Soma por categoria em um periodo, por tipo.",
      inputSchema: z.object({
        from: z.string(),
        to: z.string(),
        type: z.enum(["despesa", "receita"]),
      }),
      execute: async (inputData) => resumoImpl(db, { spaceId, ...inputData }),
    }),
    corrigir_ultima_transacao: createTool({
      id: "corrigir_ultima_transacao",
      description: "Corrige o ultimo lancamento do usuario (categoria, valor, tipo, data ou descricao).",
      inputSchema: z.object({
        type: z.enum(["despesa", "receita"]).optional(),
        amount: z.string().optional(),
        categoria: z.enum(CATEGORY_NAMES).optional(),
        description: z.string().optional(),
        occurredAt: z.string().optional(),
      }),
      execute: async (inputData) => corrigirUltimaImpl(db, { userId, spaceId, ...inputData }),
    }),
    apagar_ultima_transacao: createTool({
      id: "apagar_ultima_transacao",
      description: "Apaga o ultimo lancamento do usuario.",
      inputSchema: z.object({}),
      execute: async () => apagarUltimaImpl(db, { userId }),
    }),
  };
}
