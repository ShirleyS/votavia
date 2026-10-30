import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ASSIGNMENT_STATUSES,
  CASE_CATEGORIES,
  CASE_EVENT_TYPES,
  CASE_STATUSES,
  OBSERVATION_KINDS,
  USER_ROLES,
} from "@/shared/votavia-contract";
import { mockCases, mockDispatchOrders } from "@votavia-government/mock-data";
import { FIXTURE_CASE, FIXTURE_TIMELINE, uuid } from "../fixtures/cases";
import { DUPLICATE_CANDIDATES } from "../fixtures/ai-results";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");

/** All migrations in apply order, so `alter type ... add value` is honored. */
const migrations = readdirSync(MIGRATIONS_DIR)
  .filter((name: string) => name.endsWith(".sql"))
  .sort()
  .map((name: string) => readFileSync(path.join(MIGRATIONS_DIR, name), "utf8"));

function sqlEnum(name: string): string[] {
  const base = migrations
    .map((sql: string) =>
      sql.match(new RegExp(`create type ${name} as enum \\(([\\s\\S]*?)\\);`, "i")),
    )
    .find(Boolean);
  if (!base) throw new Error(`missing SQL enum ${name}`);
  const values = [...base[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
  for (const sql of migrations) {
    const additions = sql.matchAll(
      new RegExp(`alter type ${name} add value if not exists '([^']+)'`, "gi"),
    );
    for (const [, value] of additions) {
      if (!values.includes(value)) values.push(value);
    }
  }
  return values;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("shared contract ↔ SQL enums", () => {
  it.each([
    ["case_category", CASE_CATEGORIES],
    ["case_status", CASE_STATUSES],
    ["assignment_status", ASSIGNMENT_STATUSES],
    ["user_role", USER_ROLES],
    ["case_event_type", CASE_EVENT_TYPES],
    ["observation_kind", OBSERVATION_KINDS],
  ])("keeps %s identical to the shared array", (enumName, shared) => {
    expect(sqlEnum(enumName)).toEqual([...shared]);
  });

  it("uses the same ordering, not just the same members", () => {
    expect(sqlEnum("case_category")).not.toEqual(
      [...CASE_CATEGORIES].reverse(),
    );
  });
});

describe("identity contract", () => {
  it("uses a UUID for case identity and a non-UUID display reference", () => {
    expect(FIXTURE_CASE.case_id).toMatch(UUID_PATTERN);
    expect(FIXTURE_CASE.display_id).toMatch(/^VOT-\d{4}$/);
    expect(FIXTURE_CASE.display_id).not.toMatch(UUID_PATTERN);
    expect(FIXTURE_TIMELINE.every((event) => event.case_id === FIXTURE_CASE.case_id)).toBe(true);
  });

  it("keeps fixture relationships on the same case UUID", () => {
    expect(uuid("1")).toBe(FIXTURE_CASE.case_id);
    for (const candidate of DUPLICATE_CANDIDATES) {
      expect(candidate.case_id).toMatch(UUID_PATTERN);
      expect(candidate.case_id).not.toBe(FIXTURE_CASE.display_id);
    }
  });

  it("separates assignment statuses from case statuses", () => {
    expect(ASSIGNMENT_STATUSES).not.toEqual(CASE_STATUSES);
    for (const status of ["pending", "declined", "submitted_for_review", "verified", "returned"] as const) {
      expect(CASE_STATUSES).not.toContain(status);
    }
  });
});

describe("government module compatibility", () => {
  it.fails("uses the shared case categories (mock uses baches/alumbrado/agua/...)", () => {
    for (const item of mockCases) {
      expect(CASE_CATEGORIES).toContain(item.category as (typeof CASE_CATEGORIES)[number]);
    }
  });

  it.fails("identifies cases with the shared UUID (mock uses case-0847)", () => {
    for (const item of mockCases) expect(item.id).toMatch(UUID_PATTERN);
  });

  it.fails("uses assignment statuses from the shared contract for dispatch", () => {
    for (const order of mockDispatchOrders) {
      expect(ASSIGNMENT_STATUSES).toContain(order.state as (typeof ASSIGNMENT_STATUSES)[number]);
    }
  });

  it("documents the folio format collision with display_id", () => {
    expect(mockCases[0].folio).toMatch(/^VV-\d{4}-\d{4}$/);
    expect(mockCases[0].folio).not.toMatch(/^VOT-\d{4}$/);
  });
});
