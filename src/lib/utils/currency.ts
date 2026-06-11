const clpFormatter = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatCLP(amount: number): string {
  return clpFormatter.format(amount);
}

/** Format a raw digit string as CLP for display inside an input */
export function formatCLPInput(raw: string): string {
  const n = parseInt(raw.replace(/\D/g, "") || "0", 10);
  if (n === 0) return "";
  return new Intl.NumberFormat("es-CL").format(n);
}

export function formatCLPCompact(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";

  if (abs >= 1_000_000) {
    return `${sign}$${Math.round(abs / 1_000_000)}M`;
  }
  if (abs >= 1_000) {
    return `${sign}$${Math.round(abs / 1_000)}K`;
  }
  return formatCLP(amount);
}
