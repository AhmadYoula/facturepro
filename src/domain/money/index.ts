const BASIS_POINTS = 10_000n;
const QUANTITY_SCALE = 1_000n;

function assertNonNegative(value: bigint, name: string): void {
  if (value < 0n) {
    throw new RangeError(`${name} must be non-negative`);
  }
}

function assertBasisPoints(value: bigint, name: string): void {
  if (value < 0n || value > BASIS_POINTS) {
    throw new RangeError(`${name} must be between 0 and 10000`);
  }
}

export function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    throw new RangeError("denominator must be positive");
  }

  assertNonNegative(numerator, "numerator");
  return (numerator * 2n + denominator) / (denominator * 2n);
}

export function calculateLineNet(
  quantityMilli: bigint,
  unitPriceMinor: bigint,
  discountBp: bigint = 0n,
): bigint {
  assertNonNegative(quantityMilli, "quantityMilli");
  assertNonNegative(unitPriceMinor, "unitPriceMinor");
  assertBasisPoints(discountBp, "discountBp");

  const numerator =
    quantityMilli * unitPriceMinor * (BASIS_POINTS - discountBp);
  return roundHalfUp(numerator, QUANTITY_SCALE * BASIS_POINTS);
}

export function calculateVat(baseMinor: bigint, vatRateBp: bigint): bigint {
  assertNonNegative(baseMinor, "baseMinor");
  assertBasisPoints(vatRateBp, "vatRateBp");
  return roundHalfUp(baseMinor * vatRateBp, BASIS_POINTS);
}