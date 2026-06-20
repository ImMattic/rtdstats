import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/handlers";
import { fetchVehicles, fetchHistorical, exportUrl } from "@/lib/api";

describe("apiFetch", () => {
  it("returns parsed JSON on 200", async () => {
    const data = await fetchVehicles();
    expect(data.vehicles).toBeDefined();
    expect(Array.isArray(data.vehicles)).toBe(true);
  });

  it("throws an error on non-ok response", async () => {
    server.use(
      http.get("/api/v1/realtime/vehicles", () =>
        HttpResponse.json({ detail: "server error" }, { status: 500 })
      )
    );
    await expect(fetchVehicles()).rejects.toThrow("API 500");
  });

  it("throws on 404", async () => {
    server.use(
      http.get("/api/v1/realtime/vehicles", () =>
        new HttpResponse(null, { status: 404 })
      )
    );
    await expect(fetchVehicles()).rejects.toThrow("API 404");
  });
});

describe("fetchHistorical query string", () => {
  it("includes route_id in query string when provided", async () => {
    let capturedUrl = "";
    server.use(
      http.get("/api/v1/historical/vehicles", ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({
          start: "",
          end: "",
          page: 1,
          limit: 200,
          returned: 0,
          total: 0,
          total_pages: 0,
          vehicles: [],
        });
      })
    );
    await fetchHistorical({ route_id: "R1", limit: 50, page: 2 });
    const url = new URL(capturedUrl);
    expect(url.searchParams.get("route_id")).toBe("R1");
    expect(url.searchParams.get("limit")).toBe("50");
    expect(url.searchParams.get("page")).toBe("2");
  });

  it("omits route_id when not provided", async () => {
    let capturedUrl = "";
    server.use(
      http.get("/api/v1/historical/vehicles", ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({
          start: "",
          end: "",
          page: 1,
          limit: 200,
          returned: 0,
          total: 0,
          total_pages: 0,
          vehicles: [],
        });
      })
    );
    await fetchHistorical({ limit: 10 });
    const url = new URL(capturedUrl);
    expect(url.searchParams.has("route_id")).toBe(false);
    expect(url.searchParams.get("limit")).toBe("10");
  });
});

describe("exportUrl", () => {
  it("builds correct URL for CSV format", () => {
    const url = exportUrl({ format: "csv" });
    expect(url).toContain("/api/v1/export/vehicles");
    expect(url).toContain("format=csv");
  });

  it("includes route_id and limit when provided", () => {
    const url = exportUrl({ format: "json", route_id: "R1", limit: 100 });
    expect(url).toContain("route_id=R1");
    expect(url).toContain("limit=100");
    expect(url).toContain("format=json");
  });
});
