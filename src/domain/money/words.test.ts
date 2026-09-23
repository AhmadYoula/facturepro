import { describe, expect, it } from "vitest";

import { amountInWords } from "./words";

describe("amount in French words", () => {
  it("handles French cardinal rules", () => {
    expect(amountInWords(80n)).toBe("quatre-vingts francs guinéens");
    expect(amountInWords(81n)).toBe("quatre-vingt-un francs guinéens");
    expect(amountInWords(200n)).toBe("deux cents francs guinéens");
    expect(amountInWords(201n)).toBe("deux cent un francs guinéens");
  });

  it("handles thousands and millions", () => {
    expect(amountInWords(1_000n)).toBe("mille francs guinéens");
    expect(amountInWords(2_000_000n)).toBe("deux millions francs guinéens");
    expect(amountInWords(2_950_000n)).toBe("deux millions neuf cent cinquante mille francs guinéens");
  });
});
