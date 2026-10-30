import { describe, expect, it } from "vitest";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { openCsvFromFile, openCsvFromText, readAllCsvFromText, sniffDelimiter } from "../src/parsers/csv.js";
import { CsvParseError } from "../src/errors.js";
import { cleanupDir, makeTempDir } from "./helpers.js";

describe("CSV parser", () => {
  it("parses quoted commas, escaped quotes and embedded newlines", async () => {
    const csv = 'folio,descripcion,alcaldia\n1,"Bache, profundo ""muy grande""",Cuauhtémoc\n2,"Línea uno\nLínea dos",Cuauhtémoc\n';
    const { headers, rows } = await readAllCsvFromText(csv);
    expect(headers).toEqual(["folio", "descripcion", "alcaldia"]);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.values).toEqual(["1", 'Bache, profundo "muy grande"', "Cuauhtémoc"]);
    expect(rows[1]?.values[1]).toBe("Línea uno\nLínea dos");
  });

  it("strips a UTF-8 BOM and sniffs semicolons", async () => {
    const csv = "\uFEFFfolio;alcaldia;latitud\n1;Cuauhtémoc;19.42\n";
    const reader = await openCsvFromText(csv);
    expect(reader.headers).toEqual(["folio", "alcaldia", "latitud"]);
    expect(reader.delimiter).toBe(";");
    const rows = [];
    for await (const row of reader.rows) rows.push(row.values);
    expect(rows).toEqual([["1", "Cuauhtémoc", "19.42"]]);
  });

  it("ignores blank lines and CRLF row endings", async () => {
    const csv = "folio,alcaldia\r\n1,Cuauhtémoc\r\n\r\n2,Coyoacán\r\n";
    const { rows } = await readAllCsvFromText(csv);
    expect(rows.map((row) => row.values[0])).toEqual(["1", "2"]);
  });

  it("throws on an unterminated quoted field", async () => {
    await expect(readAllCsvFromText('folio,descripcion\n1,"sin cerrar\n')).rejects.toBeInstanceOf(CsvParseError);
  });

  it("detects Windows-1252 files when UTF-8 is invalid", async () => {
    const dir = await makeTempDir();
    try {
      const file = path.join(dir, "cp1252.csv");
      await mkdir(dir, { recursive: true });
      const buffer = Buffer.from("folio,alcaldia\n1,Cuauhtémoc\n", "latin1");
      // latin1 keeps the accented é as 0xE9, which is invalid UTF-8.
      await writeFile(file, buffer);
      const reader = await openCsvFromFile(file);
      expect(reader.encoding).toBe("windows-1252");
      const rows = [];
      for await (const row of reader.rows) rows.push(row.values);
      expect(rows[0]?.[1]).toBe("Cuauhtémoc");
    } finally {
      await cleanupDir(dir);
    }
  });

  it("sniffs the delimiter without counting inside quotes", () => {
    expect(sniffDelimiter('"a,b,c";d;e\n')).toBe(";");
    expect(sniffDelimiter("a\tb\tc\n")).toBe("\t");
  });
});
