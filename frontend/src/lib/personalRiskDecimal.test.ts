import { describe, expect, it } from "vitest";
import { decimalLess, parseEquityDecimal, parseObservation } from "./personalRiskDecimal";

describe("personal-risk exact decimal and time helpers", () => {
  it("keeps equity values as fixed-scale BigInt and enforces every boundary", () => {
    expect(parseEquityDecimal("9999999999999999.12345678")).toBe(999999999999999912345678n);
    expect(decimalLess("9.99999999", "10")).toBe(true);
    for (const value of ["0","-1","+1","01","1e2","1.123456789","10000000000000000"," 1","1 ","1,000","Infinity","NaN"]) expect(() => parseEquityDecimal(value)).toThrow();
    console.log("PASS personal-risk decimal: plain positive decimal boundaries and exact BigInt comparison are enforced without Number conversion.");
  });
  it("requires an exact offset timestamp and derives UTC, evidence and New York periods", () => {
    const spring = parseObservation("2026-03-09T00:00:00-04:00", new Date("2026-03-10T00:00:00Z"));
    expect(spring).toEqual({ normalizedUtc:"2026-03-09T04:00:00Z", confirmationReference:"saxo-owner-evidence://account-summary/20260309T040000Z", newYorkDate:"2026-03-09", newYorkWeek:"2026-03-09" });
    expect(parseObservation("2025-11-02T23:59:59-05:00", new Date("2026-01-01T00:00:00Z")).newYorkWeek).toBe("2025-10-27");
    for (const value of ["2026-03-09T04:00:00","2026-02-30T00:00:00Z","2026-03-09T04:00:00.1Z","2026-03-09T04:00:00+14:01","2027-01-01T00:00:00Z"]) expect(() => parseObservation(value, new Date("2026-03-10T00:00:00Z"))).toThrow();
    console.log("PASS personal-risk time: offset, calendar, future, UTC/reference and New York day/week rules are exact.");
  });
});
