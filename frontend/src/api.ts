import type { Category, Overview, SampleParams, SeriesPoint } from "./types";

const BASE = import.meta.env.VITE_API_URL ?? "";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    let detail = `Error ${res.status}`;
    try { detail = (await res.json()).detail ?? detail; } catch { /* respuesta sin JSON */ }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export const getOverview = () => get<Overview>("/api/overview");
export const getCategories = () => get<Category[]>("/api/categories");
export const getSeries = (category?: string) =>
  get<SeriesPoint[]>(`/api/series${category ? `?category=${encodeURIComponent(category)}` : ""}`);

export const getSampleParams = () => get<SampleParams>("/api/sample/params");

export async function postSample(p: SampleParams): Promise<void> {
  const res = await fetch(`${BASE}/api/sample`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
  if (res.ok) return;
  let msg = `Error ${res.status}`;
  try {
    const d = (await res.json()).detail;
    msg = typeof d === "string" ? d : Array.isArray(d) ? d.map((x: { loc: string[]; msg: string }) => `${x.loc.slice(1).join(".")}: ${x.msg}`).join(" · ") : msg;
  } catch { /* sin JSON */ }
  throw new Error(msg);
}
