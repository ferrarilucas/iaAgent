const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatBRL(amount: string | number): string {
  const n = typeof amount === "number" ? amount : Number(amount ?? 0);
  return brl.format(Number.isFinite(n) ? n : 0);
}

export function formatDate(iso: string): string {
  const [y, m, d] = (iso ?? "").split("-");
  if (!y || !m || !d) return iso ?? "";
  return `${d}/${m}/${y.slice(2)}`;
}

export function parseAmountBR(raw: string): string | null {
  let s = (raw ?? "").replace(/[^\d.,]/g, "");
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n.toFixed(2);
}

export function initials(name?: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function currentMonthRange(tz = "America/Sao_Paulo"): { from: string; to: string; label: string } {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: tz });
  const [y, m] = today.split("-");
  const lastDay = new Date(Number(y), Number(m), 0).getDate();
  const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  return {
    from: `${y}-${m}-01`,
    to: `${y}-${m}-${String(lastDay).padStart(2, "0")}`,
    label,
  };
}
