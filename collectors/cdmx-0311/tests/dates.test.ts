import { describe, expect, it } from "vitest";
import { normalizeClosedAt, normalizeReportedAt, parseDateValue, parseTimeValue } from "../src/normalization/dates.js";

describe("date normalization", () => {
  it("parses ISO and Mexican DD/MM/YYYY dates", () => {
    expect(parseDateValue("2024-03-15")?.iso).toBe("2024-03-15");
    expect(parseDateValue("15/03/2024")?.iso).toBe("2024-03-15");
    expect(parseDateValue("15-03-2024")?.iso).toBe("2024-03-15");
    expect(parseDateValue("20240315")?.iso).toBe("2024-03-15");
  });

  it("combines date and time with the CDMX offset", () => {
    const result = normalizeReportedAt("15/03/2024", "09:30");
    expect(result.iso).toBe("2024-03-15T09:30:00-06:00");
    expect(result.precision).toBe("datetime");
  });

  it("keeps date-only precision when no time exists", () => {
    const result = normalizeReportedAt("2024-03-15", "");
    expect(result.iso).toBe("2024-03-15");
    expect(result.precision).toBe("date");
  });

  it("handles historical daylight saving time in Mexico City", () => {
    expect(normalizeReportedAt("12/06/2021", "08:00").iso).toBe("2021-06-12T08:00:00-05:00");
    expect(normalizeReportedAt("12/06/2024", "08:00").iso).toBe("2024-06-12T08:00:00-06:00");
  });

  it("handles 12-hour clocks and Excel serial dates with warnings", () => {
    expect(parseTimeValue("01:15 PM")).toMatchObject({ hour: 13, minute: 15 });
    const serial = parseDateValue("45292");
    expect(serial?.iso).toBe("2024-01-01");
    expect(serial?.warnings).toContain("excel_serial_date");
  });

  it("returns null for invalid and sentinel values", () => {
    expect(parseDateValue("0000-00-00")).toBeNull();
    expect(parseDateValue("31/02/2024")).toBeNull();
    expect(parseDateValue("sin fecha")).toBeNull();
    expect(normalizeClosedAt("").iso).toBeNull();
  });

  it("flags ambiguous DD/MM dates but keeps the Mexican interpretation", () => {
    const result = parseDateValue("03/04/2024");
    expect(result?.iso).toBe("2024-04-03");
    expect(result?.warnings).toContain("ambiguous_date_assumed_dmy");
  });
});
