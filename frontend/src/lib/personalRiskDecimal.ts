export const EQUITY_DECIMAL = /^(?:0|[1-9][0-9]{0,15})(?:\.[0-9]{1,8})?$/;

export function parseEquityDecimal(value: string): bigint {
  if (!EQUITY_DECIMAL.test(value)) throw new Error("Enter a positive plain decimal with at most 16 whole and 8 fractional digits.");
  const [whole, fraction = ""] = value.split(".");
  const scaled = BigInt(whole + fraction.padEnd(8, "0"));
  if (scaled <= 0n) throw new Error("Account equity must be greater than zero.");
  return scaled;
}

export function decimalLess(left: string, right: string) {
  return parseEquityDecimal(left) < parseEquityDecimal(right);
}

const OBSERVED_AT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(Z|[+-]\d{2}:\d{2})$/;

export type ObservationPreview = {
  normalizedUtc: string;
  confirmationReference: string;
  newYorkDate: string;
  newYorkWeek: string;
};

export function newYorkPeriods(date: Date) {
  const fields = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(date)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value]),
  );
  const day = `${fields.year}-${fields.month}-${fields.day}`;
  const monday = new Date(`${day}T00:00:00Z`);
  const weekday = monday.getUTCDay() || 7;
  monday.setUTCDate(monday.getUTCDate() - weekday + 1);
  return { day, week: monday.toISOString().slice(0, 10) };
}

export function parseObservation(value: string, now = new Date()): ObservationPreview {
  const match = OBSERVED_AT.exec(value);
  if (!match) throw new Error("Use second precision with Z or an explicit ±HH:MM offset.");
  const [, year, month, day, hour, minute, second, offset] = match;
  if (+hour > 23 || +minute > 59 || +second > 59) throw new Error("The observation time is not valid.");
  if (offset !== "Z") {
    const offsetHour = +offset.slice(1, 3);
    const offsetMinute = +offset.slice(4, 6);
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) {
      throw new Error("The observation offset is not valid.");
    }
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error("The observation time is not valid.");
  const direction = offset === "Z" ? 0 : offset[0] === "+" ? 1 : -1;
  const offsetMinutes = offset === "Z" ? 0 : +offset.slice(1, 3) * 60 + +offset.slice(4, 6);
  const local = new Date(parsed.getTime() + direction * offsetMinutes * 60_000);
  if (
    local.getUTCFullYear() !== +year ||
    local.getUTCMonth() + 1 !== +month ||
    local.getUTCDate() !== +day ||
    local.getUTCHours() !== +hour ||
    local.getUTCMinutes() !== +minute ||
    local.getUTCSeconds() !== +second
  ) throw new Error("The observation calendar date is not valid.");
  if (parsed.getTime() > now.getTime()) throw new Error("The observation cannot be in the future.");
  const normalizedUtc = parsed.toISOString().replace(".000Z", "Z");
  const periods = newYorkPeriods(parsed);
  return {
    normalizedUtc,
    confirmationReference: `saxo-owner-evidence://account-summary/${normalizedUtc.replace(/[-:]/g, "")}`,
    newYorkDate: periods.day,
    newYorkWeek: periods.week,
  };
}
