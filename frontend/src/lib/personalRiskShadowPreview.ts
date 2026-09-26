const DECIMAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const OUTPUT_SCALE = 8;

type Rational = { numerator: bigint; denominator: bigint };

export type ShadowPreviewInput = {
  quantity: string;
  entryPrice: string;
  protectiveStop: string | null;
  entryFee: string;
  entryTax: string;
  slippageBps: string;
  maximumModeledSellProceeds: string;
  maximumModeledExitQuantity: string;
};

export type ShadowCalculation = {
  modeled_proceeds: string | null;
  close_commission: string | null;
  allowance_floor: string | null;
  allowance_value: string | null;
  allowance_quantity: string | null;
  allowance_buffer: string | null;
  allowance_selected: string | null;
  slippage_rate: string;
  slippage_amount: string | null;
  exit_cost: string | null;
  raw_loss: string | null;
  contribution: string | null;
};

export type ShadowPreview = {
  kind: "SHADOW_PREVIEW";
  calculation: ShadowCalculation;
  envelope: {
    modeledProceeds: "WITHIN_MODELED_ENVELOPE" | "OUTSIDE_MODELED_ENVELOPE" | null;
    quantity: "WITHIN_MODELED_ENVELOPE" | "OUTSIDE_MODELED_ENVELOPE";
  };
};

const pow10 = (scale: number) => 10n ** BigInt(scale);

function rational(numerator: bigint, denominator = 1n): Rational {
  if (denominator === 0n) throw new Error("Division by zero.");
  return denominator < 0n ? { numerator: -numerator, denominator: -denominator } : { numerator, denominator };
}

function parse(value: string, maximumScale = 8): Rational {
  if (!DECIMAL.test(value)) throw new Error("Expected a plain decimal string.");
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole, fraction = ""] = unsigned.split(".");
  if (fraction.length > maximumScale) throw new Error(`Expected at most ${maximumScale} decimal places.`);
  const denominator = pow10(fraction.length);
  const numerator = BigInt(whole) * denominator + BigInt(fraction || "0");
  return rational(negative ? -numerator : numerator, denominator);
}

const add = (left: Rational, right: Rational) => rational(
  left.numerator * right.denominator + right.numerator * left.denominator,
  left.denominator * right.denominator,
);
const subtract = (left: Rational, right: Rational) => add(left, rational(-right.numerator, right.denominator));
const multiply = (left: Rational, right: Rational) => rational(left.numerator * right.numerator, left.denominator * right.denominator);
const divide = (left: Rational, right: Rational) => rational(left.numerator * right.denominator, left.denominator * right.numerator);
const compare = (left: Rational, right: Rational) => left.numerator * right.denominator < right.numerator * left.denominator ? -1 : left.numerator * right.denominator > right.numerator * left.denominator ? 1 : 0;
const maximum = (left: Rational, right: Rational) => compare(left, right) >= 0 ? left : right;

function roundScaled(value: Rational, scale = OUTPUT_SCALE): bigint {
  const scaledNumerator = value.numerator * pow10(scale);
  let quotient = scaledNumerator / value.denominator;
  const remainder = scaledNumerator % value.denominator;
  const magnitude = remainder < 0n ? -remainder : remainder;
  if (magnitude * 2n >= value.denominator) quotient += scaledNumerator < 0n ? -1n : 1n;
  return quotient;
}

function formatScaled(value: bigint, scale = OUTPUT_SCALE): string {
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  const digits = magnitude.toString().padStart(scale + 1, "0");
  return `${negative ? "-" : ""}${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
}

const canonical = (value: Rational) => formatScaled(roundScaled(value));

export function personalRiskShadowPreview(input: ShadowPreviewInput): ShadowPreview {
  const quantity = parse(input.quantity);
  const entry = parse(input.entryPrice);
  const entryFee = parse(input.entryFee);
  const entryTax = parse(input.entryTax);
  const slippageBps = parse(input.slippageBps, 4);
  const maximumProceeds = parse(input.maximumModeledSellProceeds);
  const maximumQuantity = parse(input.maximumModeledExitQuantity);
  const tradeInputLimit = rational(10n ** 16n);
  if (compare(quantity, rational(0n)) <= 0 || compare(entry, rational(0n)) <= 0 ||
      compare(entryFee, rational(0n)) < 0 || compare(entryTax, rational(0n)) < 0 ||
      compare(slippageBps, rational(0n)) < 0 || compare(maximumProceeds, rational(0n)) <= 0 ||
      compare(maximumQuantity, rational(0n)) <= 0 || compare(quantity, tradeInputLimit) >= 0 ||
      compare(entry, tradeInputLimit) >= 0 || compare(entryFee, tradeInputLimit) >= 0 ||
      compare(entryTax, tradeInputLimit) >= 0 || compare(slippageBps, rational(1000n)) > 0) {
    throw new Error("Shadow preview inputs are outside the numeric contract.");
  }

  const rate = divide(slippageBps, rational(10_000n));
  const quantityEnvelope = compare(quantity, maximumQuantity) <= 0 ? "WITHIN_MODELED_ENVELOPE" : "OUTSIDE_MODELED_ENVELOPE";
  if (input.protectiveStop === null) {
    return {
      kind: "SHADOW_PREVIEW",
      calculation: {
        modeled_proceeds: null, close_commission: null, allowance_floor: null, allowance_value: null,
        allowance_quantity: null, allowance_buffer: null, allowance_selected: null,
        slippage_rate: canonical(rate), slippage_amount: null, exit_cost: null, raw_loss: null, contribution: null,
      },
      envelope: { modeledProceeds: null, quantity: quantityEnvelope },
    };
  }

  const stop = parse(input.protectiveStop);
  if (compare(stop, rational(0n)) <= 0 || compare(stop, tradeInputLimit) >= 0) throw new Error("Protective stop must be positive and within the numeric contract.");
  const proceeds = multiply(quantity, stop);
  const commission = maximum(rational(1n), multiply(parse("0.0008", 4), proceeds));
  const allowanceFloor = parse("0.5", 1);
  const allowanceValue = multiply(parse("0.0000206", 7), proceeds);
  const allowanceQuantity = multiply(parse("0.000195", 6), quantity);
  const allowanceBuffer = parse("0.2", 1);
  const allowance = maximum(allowanceFloor, add(add(allowanceValue, allowanceQuantity), allowanceBuffer));
  const slippage = multiply(proceeds, rate);
  const exitCost = add(commission, allowance);
  const rawLoss = add(add(add(add(multiply(quantity, subtract(entry, stop)), entryFee), entryTax), slippage), exitCost);
  const contribution = maximum(rational(0n), rawLoss);

  return {
    kind: "SHADOW_PREVIEW",
    calculation: {
      modeled_proceeds: canonical(proceeds), close_commission: canonical(commission),
      allowance_floor: canonical(allowanceFloor), allowance_value: canonical(allowanceValue),
      allowance_quantity: canonical(allowanceQuantity), allowance_buffer: canonical(allowanceBuffer),
      allowance_selected: canonical(allowance), slippage_rate: canonical(rate),
      slippage_amount: canonical(slippage), exit_cost: canonical(exitCost), raw_loss: canonical(rawLoss),
      contribution: canonical(contribution),
    },
    envelope: {
      modeledProceeds: compare(proceeds, maximumProceeds) <= 0 ? "WITHIN_MODELED_ENVELOPE" : "OUTSIDE_MODELED_ENVELOPE",
      quantity: quantityEnvelope,
    },
  };
}
