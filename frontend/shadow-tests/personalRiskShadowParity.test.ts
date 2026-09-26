import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { personalRiskShadowPreview, type ShadowPreviewInput } from "../src/lib/personalRiskShadowPreview";

type OracleCase = { name: string; input: ShadowPreviewInput; calculation: Record<string, string> };
const oraclePath = process.env.AZALENS_RISK_SHADOW_ORACLE;
const cases = oraclePath ? JSON.parse(readFileSync(oraclePath, "utf8")) as OracleCase[] : [];

describe.skipIf(!oraclePath)("personal-risk PostgreSQL arithmetic parity", () => {
  for (const item of cases) it(item.name, () => {
    const preview = personalRiskShadowPreview(item.input);
    expect(preview.kind).toBe("SHADOW_PREVIEW");
    for (const [field, expected] of Object.entries(item.calculation)) {
      expect(preview.calculation[field as keyof typeof preview.calculation], `${item.name}:${field}`).toBe(expected);
    }
  });
  it("reports parity only after every fixture field assertion has executed", () => {
    expect(cases.length).toBeGreaterThan(0);
    expect(cases.every((item) => Object.keys(item.calculation).length === 12)).toBe(true);
  });
});
