import { describe, expect, it } from "vitest";
import { inspectSchema, mapRow } from "../src/parsers/schema.js";

describe("CSV schema inspection", () => {
  it("maps aliases without confusing colonia_datos and 0311_colonia_registro", () => {
    const schema = inspectSchema(["folio", "fecha_solicitud", "alcaldia", "colonia_datos", "0311_colonia_registro", "latitud", "longitud"]);
    expect(schema.mappings.source_record_id.header).toBe("folio");
    expect(schema.mappings.colonia.header).toBe("colonia_datos");
    expect(schema.mappings.colonia_registro.header).toBe("0311_colonia_registro");
    expect(schema.mappings.latitude.index).toBe(5);
    expect(schema.missing_required).toEqual([]);
  });

  it("supports delegacion and accented headers", () => {
    const schema = inspectSchema(["ID SOLICITUD", "Fecha de solicitud", "Delegación", "Descripción"]);
    expect(schema.mappings.source_record_id.header).toBe("ID SOLICITUD");
    expect(schema.mappings.alcaldia.header).toBe("Delegación");
  });

  it("flags missing alcaldía and missing identity fields", () => {
    const schema = inspectSchema(["foo", "bar"]);
    expect(schema.missing_required).toContain("alcaldia");
    expect(schema.missing_required.some((value) => value.startsWith("record_identity"))).toBe(true);
  });

  it("lists PII columns without mapping them", () => {
    const schema = inspectSchema(["folio", "alcaldia", "nombre", "telefono", "correo_electronico"]);
    expect(schema.pii_columns_excluded).toEqual(["nombre", "telefono", "correo_electronico"]);
  });

  it("detects duplicate canonical headers and row column mismatches", () => {
    const schema = inspectSchema(["folio", "alcaldia", "alcaldía"]);
    expect(schema.duplicate_headers).toContain("alcaldia");
    const mapped = mapRow({ row_number: 2, values: ["1", "Cuauhtémoc"] }, schema);
    expect(mapped.column_count_mismatch).toBe(true);
    expect(mapped.actual_columns).toBe(2);
  });
});
