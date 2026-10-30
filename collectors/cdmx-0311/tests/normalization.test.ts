import { describe, expect, it } from "vitest";
import { normalizeRecord } from "../src/normalization/record.js";
import { BASE_HEADERS, baseValues, makeContext, makeMappedRow } from "./helpers.js";

describe("official record normalization", () => {
  it("preserves government labels and emits VotaVía-compatible fields", () => {
    const { schema, mapped } = makeMappedRow(BASE_HEADERS, baseValues());
    const result = normalizeRecord(mapped, schema, makeContext());
    expect(result.record).not.toBeNull();
    const record = result.record!;
    expect(record.source).toBe("cdmx_0311");
    expect(record.source_record_id).toBe("CUH-TEST-0001");
    expect(record.original_category).toBe("Baches y pavimento");
    expect(record.normalized_category).toBe("road_damage");
    expect(record.original_status).toBe("Concluido");
    expect(record.normalized_status).toBe("resolved");
    expect(record.reported_at).toBe("2024-03-15T09:30:00-06:00");
    expect(record.closed_at).toBe("2024-03-20");
    expect(record.raw_reference.row_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(record.raw_reference.row_number).toBe(2);
    expect(result.piiColumnsExcluded).toBe(2);
  });

  it("filters other alcaldías by default", () => {
    const { schema, mapped } = makeMappedRow(BASE_HEADERS, baseValues({ alcaldia: "Coyoacán" }));
    const result = normalizeRecord(mapped, schema, makeContext());
    expect(result.filteredOut).toBe(true);
    expect(result.record).toBeNull();
  });

  it("accepts other alcaldías when explicitly requested", () => {
    const { schema, mapped } = makeMappedRow(BASE_HEADERS, baseValues({ alcaldia: "Coyoacán" }));
    const result = normalizeRecord(mapped, schema, makeContext({ allAlcaldias: true }));
    expect(result.record?.alcaldia).toBe("Coyoacán");
  });

  it("keeps missing-alcaldía rows only when explicitly enabled, without inferring Cuauhtémoc", () => {
    const { schema, mapped } = makeMappedRow(BASE_HEADERS, baseValues({ alcaldia: "" }));
    const filtered = normalizeRecord(mapped, schema, makeContext());
    expect(filtered.filteredOut).toBe(true);
    const included = normalizeRecord(mapped, schema, makeContext({ includeMissingAlcaldia: true }));
    expect(included.record?.alcaldia).toBe("No especificada");
    expect(included.record?.data_quality_flags).toContain("missing_alcaldia");
  });

  it("scrubs contact PII and never outputs excluded PII columns", () => {
    const { schema, mapped } = makeMappedRow(
      BASE_HEADERS,
      baseValues({ descripcion: "Contacto: 55 1234 5678 o vecino@example.com" }),
    );
    const result = normalizeRecord(mapped, schema, makeContext());
    expect(result.record?.description).not.toContain("1234 5678");
    expect(result.record?.description).toContain("[redacted:phone]");
    expect(result.piiRedactions).toBe(2);
    expect(JSON.stringify(result.record)).not.toContain("Ana López");
  });

  it("does not fabricate coordinates when they are invalid or missing", () => {
    const { schema, mapped } = makeMappedRow(BASE_HEADERS, baseValues({ latitud: "999", longitud: "" }));
    const result = normalizeRecord(mapped, schema, makeContext());
    expect(result.record?.latitude).toBeNull();
    expect(result.record?.longitude).toBeNull();
    expect(result.record?.data_quality_flags).toContain("missing_coordinates");
    expect(result.record?.data_quality_flags).toContain("incomplete_coordinates");
  });

  it("uses a content-stable natural key, not a row number", () => {
    const values = baseValues({ folio: "", fecha_solicitud: "", hora_solicitud: "" });
    const first = makeMappedRow(BASE_HEADERS, values, 2);
    const second = makeMappedRow(BASE_HEADERS, values, 99);
    const a = normalizeRecord(first.mapped, first.schema, makeContext({ rowNumber: 2 })).record!;
    const b = normalizeRecord(second.mapped, second.schema, makeContext({ rowNumber: 99 })).record!;
    expect(a.dedupe_key).toBe(b.dedupe_key);
    expect(a.record_hash).toBe(b.record_hash);
    expect(a.dedupe_key).toMatch(/^0311:natural:/);
  });

  it("changes the content hash when the government status changes", () => {
    const first = makeMappedRow(BASE_HEADERS, baseValues());
    const second = makeMappedRow(BASE_HEADERS, baseValues({ estatus: "En proceso" }));
    const a = normalizeRecord(first.mapped, first.schema, makeContext()).record!;
    const b = normalizeRecord(second.mapped, second.schema, makeContext()).record!;
    expect(a.dedupe_key).toBe(b.dedupe_key);
    expect(a.record_hash).not.toBe(b.record_hash);
  });

  it("excludes non-infrastructure records only when infrastructure-only is requested", () => {
    const { schema, mapped } = makeMappedRow(
      BASE_HEADERS,
      baseValues({ categoria: "Seguridad vial", subcategoria: "Choque", descripcion: "Accidente vial" }),
    );
    expect(normalizeRecord(mapped, schema, makeContext()).record).not.toBeNull();
    const excluded = normalizeRecord(mapped, schema, makeContext({ infrastructureOnly: true }));
    expect(excluded.filteredOut).toBe(true);
  });

  it("rejects a row with no stable identity", () => {
    const { schema, mapped } = makeMappedRow(
      BASE_HEADERS,
      baseValues({ folio: "", fecha_solicitud: "", hora_solicitud: "", descripcion: "" }),
    );
    const result = normalizeRecord(mapped, schema, makeContext());
    expect(result.rejected).toBe(true);
    expect(result.errors[0]).toContain("stable identity");
  });

  it("rejects rows whose column count does not match the header", () => {
    const schema = makeMappedRow(BASE_HEADERS, baseValues()).schema;
    const mapped = {
      row_number: 2,
      values: ["only-one"],
      fields: {},
      column_count_mismatch: true,
      expected_columns: BASE_HEADERS.length,
      actual_columns: 1,
      row_sha256_input: "only-one",
    };
    const result = normalizeRecord(mapped, schema, makeContext());
    expect(result.rejected).toBe(true);
    expect(result.errors[0]).toContain("column_count_mismatch");
  });
});
