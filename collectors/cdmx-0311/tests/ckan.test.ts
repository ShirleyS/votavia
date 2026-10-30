import { describe, expect, it } from "vitest";
import { readJsonFile } from "../src/lib/fs.js";
import { CollectorError } from "../src/errors.js";
import {
  fetchDatastoreBatches,
  parseCkanHtml,
  parseCkanPackage,
  resourcePageUrl,
  selectResources,
} from "../src/adapters/ckan.js";
import type { HttpClient } from "../src/lib/http.js";
import { fixturePath } from "./helpers.js";

describe("CKAN package parsing", () => {
  it("reads license, years and resources from package_show JSON", async () => {
    const payload = await readJsonFile<unknown>(fixturePath("ckan-package-0311.json"));
    const dataset = parseCkanPackage(payload, { baseUrl: "https://datos.cdmx.gob.mx", datasetName: "0311" });
    expect(dataset.license_id).toBe("CC-BY-4.0-ESP");
    expect(dataset.organization).toContain("ADIP");
    expect(dataset.resources).toHaveLength(7);
    expect(dataset.resources.every((resource) => resource.page_url.startsWith("https://datos.cdmx.gob.mx/dataset/0311/resource/"))).toBe(true);
  });

  it("selects one resource per year and retains alternatives", async () => {
    const payload = await readJsonFile<unknown>(fixturePath("ckan-package-0311.json"));
    const dataset = parseCkanPackage(payload, { baseUrl: "https://datos.cdmx.gob.mx", datasetName: "0311" });
    const selected = selectResources(dataset);
    expect(selected.map((resource) => resource.year)).toEqual([2019, 2020, 2021, 2022, 2023, 2024]);
    const y2022 = selected.find((resource) => resource.year === 2022)!;
    expect(y2022.id).toBe("253cd343-e420-49a6-b795-1038ee4073a9");
    expect(y2022.alternatives).toHaveLength(1);
    expect(y2022.alternatives[0]?.id).toBe("2722a030-020c-497c-bef8-a8c6188f7aaa");
  });

  it("filters by year and leaves the selectable years intact", async () => {
    const payload = await readJsonFile<unknown>(fixturePath("ckan-package-0311.json"));
    const dataset = parseCkanPackage(payload, { baseUrl: "https://datos.cdmx.gob.mx", datasetName: "0311" });
    expect(selectResources(dataset, { years: [2024] }).map((resource) => resource.year)).toEqual([2024]);
  });

  it("builds CKAN resource page URLs", () => {
    expect(resourcePageUrl("https://datos.cdmx.gob.mx", "0311", "abc")).toBe(
      "https://datos.cdmx.gob.mx/dataset/0311/resource/abc",
    );
  });

  it("parses resource links from an HTML fallback page", () => {
    const html = `<html><title>Solicitudes *0311</title><body>
      <a href="/dataset/0311/resource/84bfe107-c6b5-4c9b-8f7c-69c65cf354bc">Solicitudes *0311 (2019)</a>
      <a href="https://datos.cdmx.gob.mx/dataset/0311/resource/44913088-806d-4f80-acca-1409a8225e9c">Solicitudes *0311 (2024)</a>
    </body></html>`;
    const dataset = parseCkanHtml(html, { baseUrl: "https://datos.cdmx.gob.mx", datasetName: "0311" });
    expect(dataset.resources.map((resource) => resource.year)).toEqual([2019, 2024]);
    expect(dataset.resources[0]?.download_url).toContain("/download/");
  });

  it("throws a typed error when no resources exist", () => {
    expect(() => parseCkanPackage({ success: true, result: { id: "x", name: "x", resources: [] } }, { baseUrl: "https://example.test" }))
      .toThrow(CollectorError);
  });
});

describe("CKAN DataStore pagination", () => {
  function fakeClient(handler: (url: string) => unknown): HttpClient {
    return { fetchJson: async (url: string) => ({ value: handler(url), response: new Response(), text: "" }) } as unknown as HttpClient;
  }

  it("pages until the reported total is reached", async () => {
    const offsets: number[] = [];
    const client = fakeClient((url) => {
      const offset = Number(new URL(url).searchParams.get("offset"));
      offsets.push(offset);
      const records = offset === 0
        ? [{ folio: "A" }, { folio: "B" }]
        : offset === 2 ? [{ folio: "C" }] : [];
      return { success: true, result: { total: 3, records, fields: [{ id: "folio", type: "text" }] } };
    });
    const batches = [];
    for await (const batch of fetchDatastoreBatches({ client, baseUrl: "https://example.test", resourceId: "r1", pageSize: 2 })) {
      batches.push(batch);
    }
    expect(offsets).toEqual([0, 2]);
    expect(batches.flatMap((batch) => batch.records)).toHaveLength(3);
  });

  it("refuses to silently truncate a result above maxRecords", async () => {
    const client = fakeClient(() => ({ success: true, result: { total: 100, records: [{ a: 1 }], fields: [{ id: "a", type: "text" }] } }));
    const iterator = fetchDatastoreBatches({ client, baseUrl: "https://example.test", resourceId: "r1", maxRecords: 10 });
    await expect(iterator.next()).rejects.toMatchObject({ code: "EXPORT_LIMIT" });
  });
});
