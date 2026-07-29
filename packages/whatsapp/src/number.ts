export function normalizeBrazilNumber(input: string): string {
  const digits = (input ?? "").replace(/\D/g, "");

  if (digits.length === 13 && digits.startsWith("55")) {
    return digits;
  }
  if (digits.length === 12 && digits.startsWith("55")) {
    const ddd = digits.slice(2, 4);
    const sub = digits.slice(4);
    return `55${ddd}9${sub}`;
  }
  if (digits.length === 11) {
    return `55${digits}`;
  }
  if (digits.length === 10) {
    const ddd = digits.slice(0, 2);
    const sub = digits.slice(2);
    return `55${ddd}9${sub}`;
  }
  return digits;
}
