import { describe, expect, it } from "vitest";

import { buildCsv } from "./csv";

describe("CSV export", () => {
  it("uses a BOM and semicolon delimiter", () => {
    expect(buildCsv(["Client", "Montant"], [["Atelier Keita", "2500000"]])).toBe(
      "\uFEFFClient;Montant\r\nAtelier Keita;2500000\r\n",
    );
  });

  it("neutralizes spreadsheet formulas and escapes separators", () => {
    expect(buildCsv(["Note"], [["=SUM(A1)"]])).toContain("'=SUM(A1)");
    expect(buildCsv(["Note"], [["Client; important"]])).toContain(
      '"Client; important"',
    );
  });
});
