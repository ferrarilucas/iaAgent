import { z } from "zod";

export const saleInput = z.object({
  customer: z.string().trim().min(1).max(120),
  items: z.array(z.object({
    description: z.string().trim().min(1).max(150),
    quantity: z.number().int().min(1).max(999),
  })).min(1).max(30),
  installments: z.number().int().min(1).max(24).optional(),
  pending: z.boolean().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export function readSimpleSale(text: string): z.infer<typeof saleInput> | undefined {
  const parts = /^([^\d\n!?]{1,120}?)\s+[-–—]\s+(\d.+)$/s.exec(text);
  if (!parts) return;
  const [, customer, order] = parts;
  if (/\b(?:parcel\p{L}*|vezes|fiado|pendente|pag\p{L}*|venc\p{L}*|dia|amanh[ãa]|pix|dinheiro|cart[ãa]o|\d+x)\b|[:/;!?]/iu.test(order)) return;
  const entries = order.split(/,\s*(?:e\s+)?(?=\d)|\s+e\s+(?=\d)/i);
  let product = "";
  const items = [];
  for (const entry of entries) {
    const match = /^(\d+)\s+([\p{L}][\p{L}\s-]*?)\.?$/u.exec(entry.trim());
    if (!match) return;
    let description = match[2];
    if (/^de\s+/i.test(description) && product) description = `${product} ${description}`;
    else product = description.split(/\s+/)[0];
    items.push({ quantity: Number(match[1]), description });
  }
  const parsed = saleInput.safeParse({ customer, items });
  if (parsed.success) return parsed.data;
}
