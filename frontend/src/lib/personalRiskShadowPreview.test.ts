import { describe, expect, it } from "vitest";
import fixtures from "../../../backend/tests/fixtures/personalRiskShadowArithmetic.json";
import { personalRiskShadowPreview } from "./personalRiskShadowPreview";

describe("personal-risk arithmetic shadow preview", () => {
  const exactAllowanceFormulaAtOrBelowFloor = (quantity: string, stop: string) => {
    const scaled = (value: string) => {
      const [whole, fraction = ""] = value.split(".");
      return BigInt(whole) * 100_000_000n + BigInt(fraction.padEnd(8, "0"));
    };
    const quantity8 = scaled(quantity);
    const proceeds16 = quantity8 * scaled(stop);
    // Compare proceeds*0.0000206 + quantity*0.000195 + 0.20 <= 0.50
    // at a common denominator of 10^23, without rounding either component.
    const valueNumerator = proceeds16 * 206n;
    const quantityNumerator = quantity8 * 195n * 1_000_000_000n;
    const remainingFloorNumerator = 3n * 10n ** 22n;
    return valueNumerator + quantityNumerator <= remainingFloorNumerator;
  };

  it("proves two hand-computed anchors independently", () => {
    const loss = personalRiskShadowPreview(fixtures.find((item) => item.name === "hand-anchor-loss")!);
    expect(loss.kind).toBe("SHADOW_PREVIEW");
    expect(loss.calculation).toMatchObject({ modeled_proceeds:"900.00000000", close_commission:"1.00000000", allowance_selected:"0.50000000", slippage_amount:"2.25000000", exit_cost:"1.50000000", raw_loss:"106.75000000", contribution:"106.75000000" });
    const gain = personalRiskShadowPreview(fixtures.find((item) => item.name === "hand-anchor-zero-floor")!);
    expect(gain.calculation).toMatchObject({ modeled_proceeds:"100.00000000", slippage_amount:"0.25000000", raw_loss:"-8.25000000", contribution:"0.00000000" });
    console.log("PASS shadow preview: independent hand-computed loss and zero-floor anchors match.");
  });

  it("rounds an exact negative half-unit raw loss away from zero", () => {
    const result = personalRiskShadowPreview(fixtures.find((item) => item.name === "negative-half-unit-rounding")!);
    expect(result.calculation.raw_loss).toBe("-0.00000001");
    expect(result.calculation.contribution).toBe("0.00000000");
    console.log("PASS shadow preview: exact -0.000000005 raw loss rounds to -0.00000001 with zero contribution.");
  });

  it("derives commission, allowance and envelope boundaries from fixture inputs", () => {
    const preview = (name: string) => personalRiskShadowPreview(fixtures.find((item) => item.name === name)!);
    expect(preview("commission-below-floor").calculation.close_commission).toBe("1.00000000");
    expect(preview("commission-at-floor").calculation.close_commission).toBe("1.00000000");
    expect(preview("commission-above-floor").calculation.close_commission).toBe("1.00000001");
    for (const name of ["allowance-below-crossover", "allowance-nearest-below-crossover"]) {
      const fixture = fixtures.find((item) => item.name === name)!;
      const calculation = preview(name).calculation;
      expect(exactAllowanceFormulaAtOrBelowFloor(fixture.quantity, fixture.protectiveStop!)).toBe(true);
      expect(calculation.allowance_selected).toBe("0.50000000");
    }
    const aboveFixture = fixtures.find((item) => item.name === "allowance-above-crossover")!;
    const above = preview("allowance-above-crossover").calculation;
    expect(exactAllowanceFormulaAtOrBelowFloor(aboveFixture.quantity, aboveFixture.protectiveStop!)).toBe(false);
    expect(above.allowance_selected).not.toBe("0.50000000");
    expect(preview("proceeds-envelope-exact").envelope.modeledProceeds).toBe("WITHIN_MODELED_ENVELOPE");
    expect(preview("proceeds-envelope-above").envelope.modeledProceeds).toBe("OUTSIDE_MODELED_ENVELOPE");
    expect(preview("quantity-envelope-exact").envelope.quantity).toBe("WITHIN_MODELED_ENVELOPE");
    expect(preview("quantity-envelope-above").envelope.quantity).toBe("OUTSIDE_MODELED_ENVELOPE");
    console.log("PASS shadow preview: commission, derived allowance crossover and informational envelope boundaries are asserted.");
  });

  it("keeps missing-stop nullability a separately labelled structural result", () => {
    const result = personalRiskShadowPreview(fixtures.find((item) => item.name === "missing-stop-structural")!);
    expect(result.kind).toBe("SHADOW_PREVIEW");
    expect(Object.entries(result.calculation).filter(([key]) => key !== "slippage_rate").every(([, value]) => value === null)).toBe(true);
    expect(result.calculation.slippage_rate).toBe("0.00250000");
    expect(result.envelope.modeledProceeds).toBeNull();
    console.log("PASS shadow preview structural check: missing stop makes every stop-dependent calculation null, not zero.");
  });
});
