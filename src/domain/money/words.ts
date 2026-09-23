const units: Record<string, string> = { "0": "zéro", "1": "un", "2": "deux", "3": "trois", "4": "quatre", "5": "cinq", "6": "six", "7": "sept", "8": "huit", "9": "neuf", "10": "dix", "11": "onze", "12": "douze", "13": "treize", "14": "quatorze", "15": "quinze", "16": "seize" };

function underHundred(value: bigint): string {
  if (value < 17n) return units[value.toString()] ?? "";
  if (value < 20n) return `dix-${units[(value - 10n).toString()]}`;
  const tens: Record<string, string> = { "2": "vingt", "3": "trente", "4": "quarante", "5": "cinquante", "6": "soixante" };
  if (value < 70n) {
    const ten = value / 10n;
    const rest = value % 10n;
    if (rest === 0n) return tens[ten.toString()] ?? "";
    if (rest === 1n) return `${tens[ten.toString()]} et un`;
    return `${tens[ten.toString()]}-${units[rest.toString()]}`;
  }
  if (value < 80n) return value === 71n ? "soixante et onze" : `soixante-${underHundred(value - 60n)}`;
  return value === 80n ? "quatre-vingts" : `quatre-vingt-${underHundred(value - 80n)}`;
}

function underThousand(value: bigint): string {
  if (value < 100n) return underHundred(value);
  const hundreds = value / 100n;
  const rest = value % 100n;
  const prefix = hundreds === 1n ? "cent" : `${units[hundreds.toString()]} cent`;
  if (rest === 0n) return hundreds === 1n ? prefix : `${prefix}s`;
  return `${prefix} ${underHundred(rest)}`;
}

function group(value: bigint, label: string): string {
  if (value === 0n) return "";
  const prefix = value === 1n && label === "mille" ? "" : underThousand(value);
  return `${prefix}${prefix === "" ? "" : " "}${label}`;
}

export function amountInWords(amount: bigint, currency = "francs guinéens"): string {
  if (amount < 0n) throw new RangeError("amount must be non-negative");
  if (amount === 0n) return `zéro ${currency}`;
  const billions = amount / 1_000_000_000n;
  const millions = (amount % 1_000_000_000n) / 1_000_000n;
  const thousands = (amount % 1_000_000n) / 1_000n;
  const remainder = amount % 1_000n;
  const parts = [
    billions > 0n ? `${underThousand(billions)} milliard${billions > 1n ? "s" : ""}` : "",
    millions > 0n ? group(millions, "million" + (millions > 1n ? "s" : "")) : "",
    thousands > 0n ? group(thousands, "mille") : "",
    remainder > 0n ? underThousand(remainder) : "",
  ].filter(Boolean);
  return `${parts.join(" ")} ${currency}`;
}
