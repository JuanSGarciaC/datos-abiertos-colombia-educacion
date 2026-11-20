// Lógica del mapa por departamento que no depende de Three.js: se prueba con Vitest (mapData.test.ts).
import type { CategoryYear } from "./types";

export type Indicator = "total" | "year" | "change";

/** Años presentes en los datos, ordenados. */
export function yearsOf(rows: CategoryYear[]): string[] {
  return [...new Set(rows.map((r) => r.year))].sort();
}

/**
 * Valor de cada departamento según el indicador:
 * - total: suma de todos los años;
 * - year: valor del año elegido;
 * - change: % de cambio del año elegido frente al anterior (null si no hay año anterior o era 0).
 * Un departamento sin fila para ese año no aparece: el mapa lo pinta como «sin datos», no como 0.
 */
export function valuesFor(rows: CategoryYear[], indicator: Indicator, year?: string): Map<string, number | null> {
  const out = new Map<string, number | null>();
  if (indicator === "total") {
    for (const r of rows) out.set(r.category, (out.get(r.category) ?? 0) + r.value);
    return out;
  }
  const years = yearsOf(rows);
  const y = year && years.includes(year) ? year : years[years.length - 1];
  const at = (yy: string | undefined) => new Map(rows.filter((r) => r.year === yy).map((r) => [r.category, r.value]));
  const cur = at(y);
  if (indicator === "year") return cur;
  const prev = at(years[years.indexOf(y) - 1]);
  for (const [cat, v] of cur) {
    const p = prev.get(cat);
    out.set(cat, p ? ((v - p) / p) * 100 : null);
  }
  return out;
}

/** Altura relativa (0–1). En «cambio» la altura es la magnitud; el signo va en el color. */
export function heightsFor(values: Map<string, number | null>, indicator: Indicator): Map<string, number> {
  const nums = [...values.values()].filter((v): v is number => v != null);
  const max = Math.max(...nums.map((v) => (indicator === "change" ? Math.abs(v) : v)), 0) || 1;
  const out = new Map<string, number>();
  for (const [k, v] of values) if (v != null) out.set(k, (indicator === "change" ? Math.abs(v) : Math.max(v, 0)) / max);
  return out;
}

type RGB = [number, number, number];
export function hexToRgb(hex: string): RGB {
  const h = hex.trim().replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as RGB;
}
export function mix(a: string, b: string, t: number): string {
  const [x, y] = [hexToRgb(a), hexToRgb(b)];
  const k = Math.min(1, Math.max(0, t));
  return "#" + x.map((c, i) => Math.round(c + (y[i] - c) * k).toString(16).padStart(2, "0")).join("");
}

export interface Palette { low: string; high: string; up: string; down: string }

/** Color de un departamento: secuencial (oscuro → acento) o divergente (verde sube, ámbar baja). */
export function colorFor(value: number, height: number, indicator: Indicator, p: Palette): string {
  if (indicator === "change") return mix(p.low, value >= 0 ? p.up : p.down, 0.25 + 0.75 * height);
  return mix(p.low, p.high, 0.15 + 0.85 * height);
}

/**
 * Proyección equirectangular corregida por la latitud media de Colombia (~4°N): en un país tan cerca del
 * ecuador basta, y es fácil de explicar. Devuelve x hacia el este e y hacia el norte, en «grados de ecuador».
 */
const LAT0 = 4;
const K = Math.cos((LAT0 * Math.PI) / 180);
export function project([lon, lat]: [number, number], center: [number, number] = [-74, LAT0]): [number, number] {
  return [(lon - center[0]) * K, lat - center[1]];
}

/** San Andrés mide unos 26 km²: a escala real no se vería. Se amplía alrededor de su centro. */
export const ISLAND = "San Andrés y Providencia";
export const ISLAND_ZOOM = 3;
export function zoomAround(pts: [number, number][], factor: number): [number, number][] {
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return pts.map(([x, y]) => [cx + (x - cx) * factor, cy + (y - cy) * factor]);
}
