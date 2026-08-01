export const CURRENCY_LABEL = { ar: "درهم", fr: "DH" } as const;

// Left-to-Right Isolate / Pop Directional Isolate: without these, a space-
// grouped number ("456 583.77") sitting inside RTL Arabic text gets its
// digit groups visually reordered by the bidi algorithm (each space-
// separated run is treated independently). Wrapping the number in an LTR
// isolate pins its internal left-to-right order no matter what surrounds it.
const LRI = "⁦";
const PDI = "⁩";

/** Groups the integer part of a number with a space every 3 digits, e.g. 456583.77 -> "456 583.77". */
function groupThousands(value: number, decimals: number): string {
  const isNegative = value < 0;
  const [intPart, decPart] = Math.abs(value).toFixed(decimals).split(".");
  const groupedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const result = decPart !== undefined ? `${groupedInt}.${decPart}` : groupedInt;
  return isNegative ? `-${result}` : result;
}

export function formatCurrency(
  amount: number | string,
  lang: "ar" | "fr" = "ar",
  withoutCurrency = false,
): string {
  const value = typeof amount === "string" ? Number(amount) : amount;
  const currencyLabel = CURRENCY_LABEL[lang];
  const formatted = `${LRI}${groupThousands(value, 2)}${PDI}`;
  return withoutCurrency ? formatted : `${formatted} ${currencyLabel}`;
}
