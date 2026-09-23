import { describe, expect, it } from "vitest";

import { calculateLineNet, calculateVat } from "./index";

describe("money calculations", () => {
  it("calculates a GNF line without floating point arithmetic", () => {
    expect(calculateLineNet(3_000n, 125_000n)).toBe(375_000n);
    expect(calculateLineNet(2_500n, 40_000n, 1_000n)).toBe(90_000n);
  });

  it("uses half-up rounding for a half minor unit", () => {
    expect(calculateLineNet(1_000n, 2_725n)).toBe(2_725n);
    expect(calculateVat(2_725n, 1_800n)).toBe(491n);
  });

  it("supports currency minor units without changing the algorithm", () => {
    expect(calculateLineNet(3_000n, 1_999n)).toBe(5_997n);
    expect(calculateVat(5_997n, 1_800n)).toBe(1_079n);
  });

  it("rejects invalid rates and negative amounts", () => {
    expect(() => calculateVat(100n, 10_001n)).toThrow(RangeError);
    expect(() => calculateLineNet(-1n, 100n)).toThrow(RangeError);
  });
});