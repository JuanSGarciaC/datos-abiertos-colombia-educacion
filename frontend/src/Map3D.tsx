import { useEffect, useMemo, useRef, useState } from "react";
import { colorFor, heightsFor, ISLAND_ZOOM, valuesFor, yearsOf, type Indicator, type Palette } from "./mapData";
import type { GeoFeature, MapScene } from "./mapScene";
import type { CategoryYear } from "./types";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const pf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1, signDisplay: "exceptZero" });
const GEO = `${import.meta.env.BASE_URL}geo/colombia-departamentos.json`;
const LABELS: Record<Indicator, string> = { total: "Total del periodo", year: "Un año", change: "Cambio frente al año anterior" };

type Status = "idle" | "loading" | "ready" | "failed";

interface Props { rows: CategoryYear[]; selected: string; onSelect: (category: string) => void; yearly: boolean }

/** Lee la paleta de styles.css para que el lienzo use los mismos colores que el resto del tablero. */
function palette(): Palette & { none: string } {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return { low: v("--map-low"), high: v("--accent"), up: v("--ok"), down: v("--warn"), none: v("--map-none") };
}

export default function Map3D({ rows, selected, onSelect, yearly }: Props) {
  const years = useMemo(() => yearsOf(rows), [rows]);
  const [indicator, setIndicator] = useState<Indicator>("total");
  const [yi, setYi] = useState(Math.max(0, years.length - 1));
  const [status, setStatus] = useState<Status>("idle");
  const [hint, setHint] = useState<string | null>(null);
  const [top, setTop] = useState(false);
  const section = useRef<HTMLElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const scene = useRef<MapScene | null>(null);

  useEffect(() => setYi(Math.max(0, years.length - 1)), [years.length]);
  const minYi = indicator === "change" ? 1 : 0;
  const year = years[Math.max(minYi, Math.min(yi, years.length - 1))];
  const values = useMemo(() => valuesFor(rows, indicator, year), [rows, indicator, year]);
  const total = useMemo(() => [...values.values()].reduce<number>((s, v) => s + (v ?? 0), 0), [values]);
  const fmt = (v: number | null | undefined) => (v == null ? "sin datos" : indicator === "change" ? `${pf.format(v)} %` : nf.format(v));
  const describe = (name: string) => {
    const v = values.get(name);
    const share = indicator !== "change" && v != null && total ? ` (${(v / total * 100).toLocaleString("es-CO", { maximumFractionDigits: 1 })} % del total)` : "";
    return `${name}: ${fmt(v)}${share}`;
  };
  // Las funciones que usa la escena cambian con cada render; la escena lee siempre la última versión.
  const latest = useRef({ describe, onSelect, selected, values });
  latest.current = { describe, onSelect, selected, values };

  // Carga diferida: Three.js y la geometría se piden cuando la tarjeta está a menos de 400 px de la pantalla.
  useEffect(() => {
    const el = section.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) { setStatus("loading"); return; }
    const io = new IntersectionObserver(([en]) => { if (en.isIntersecting) { setStatus((s) => (s === "idle" ? "loading" : s)); io.disconnect(); } }, { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (status !== "loading" || !wrap.current) return;
    let cancelled = false;
    const host = wrap.current;
    // Temporizador de seguridad: si en 10 s no hay mapa, queda la tabla.
    const timer = setTimeout(() => { if (!scene.current) { cancelled = true; setStatus("failed"); } }, 10000);
    Promise.all([import("./mapScene"), fetch(GEO).then((r) => { if (!r.ok) throw new Error(`geo ${r.status}`); return r.json(); })])
      .then(([mod, geo]: [typeof import("./mapScene"), { features: GeoFeature[] }]) => {
        if (cancelled) return;
        const p = palette();
        scene.current = mod.createScene(host, {
          features: geo.features,
          reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
          small: matchMedia("(max-width: 600px)").matches,
          base: p.none,
          onHover: (name, x, y) => {
            const t = tip.current;
            if (!t) return;
            if (!name) { t.hidden = true; return; }
            const r = host.getBoundingClientRect();
            t.hidden = false;
            t.textContent = latest.current.describe(name);
            // Solo transform: el tooltip no provoca recálculo de layout al moverse.
            const tx = Math.min(x - r.left + 14, r.width - t.offsetWidth - 8);
            t.style.transform = `translate(${Math.max(8, tx)}px, ${Math.max(8, y - r.top - 38)}px)`;
          },
          onPick: (name) => {
            const { values: vals, selected: sel, onSelect: pick } = latest.current;
            if (!vals.has(name)) { setHint(`${name}: sin datos en este conjunto.`); return; }
            setHint(null);
            pick(name === sel ? "" : name);
          },
        });
        clearTimeout(timer);
        setStatus("ready");
      })
      .catch(() => { if (!cancelled) setStatus("failed"); });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      scene.current?.dispose();
      scene.current = null;
    };
    // La dependencia sigue en true de «loading» a «ready»: así la escena recién creada no se desmonta al cambiar de estado.
  }, [status === "loading" || status === "ready"]); // eslint-disable-line react-hooks/exhaustive-deps

  // Datos → alturas y colores. Se envían a la escena, que anima solo la escala vertical.
  useEffect(() => {
    if (status !== "ready" || !scene.current) return;
    const p = palette();
    const heights = heightsFor(values, indicator);
    const colors = new Map<string, string>();
    for (const [k, v] of values) if (v != null) colors.set(k, colorFor(v, heights.get(k) ?? 0, indicator, p));
    scene.current.setData(heights, colors, selected || null);
    if (tip.current) tip.current.hidden = true; // su texto era del indicador anterior
  }, [status, values, indicator, selected]);

  useEffect(() => { scene.current?.setTop(top); }, [top, status]);

  const sorted = [...values.entries()].sort((a, b) => (b[1] ?? -Infinity) - (a[1] ?? -Infinity));
  const nums = sorted.map(([, v]) => v).filter((v): v is number => v != null);
  const legend = indicator === "change"
    ? { a: `${pf.format(Math.min(...nums, 0))} %`, b: `${pf.format(Math.max(...nums, 0))} %` }
    : { a: "0", b: nf.format(Math.max(...nums, 0)) };

  return (
    <section className="card map3d" aria-labelledby="h-map" ref={section}>
      <div className="row">
        <h2 id="h-map">Matrícula por departamento</h2>
        <div className="map-form">
          <label>
            Indicador{" "}
            <select value={indicator} onChange={(e) => setIndicator(e.target.value as Indicator)}>
              {(Object.keys(LABELS) as Indicator[]).map((k) => <option key={k} value={k}>{LABELS[k]}</option>)}
            </select>
          </label>
          {indicator !== "total" && years.length > minYi && (
            <label className="map-year">
              Año <b>{year}</b>
              <input type="range" min={minYi} max={years.length - 1} value={Math.max(minYi, yi)} onChange={(e) => setYi(Number(e.target.value))} aria-label="Año" aria-valuetext={year} />
            </label>
          )}
        </div>
      </div>

      <div className={`map-wrap ${status}`} ref={wrap}>
        {status !== "ready" && (
          <p className="map-status" role="status">
            {status === "failed" ? "El mapa 3D no se pudo cargar en este navegador. Abajo está la tabla con las mismas cifras." : "Cargando el mapa 3D…"}
          </p>
        )}
        <div className="map-tip" ref={tip} hidden />
        {status === "ready" && (
          <div className="map-ctl">
            <button type="button" onClick={() => scene.current?.rotate(-30)} aria-label="Girar a la izquierda">↺</button>
            <button type="button" onClick={() => scene.current?.rotate(30)} aria-label="Girar a la derecha">↻</button>
            <button type="button" onClick={() => setTop((t) => !t)} aria-pressed={top}>{top ? "Vista inclinada" : "Vista cenital"}</button>
          </div>
        )}
        <div className={`map-legend${indicator === "change" ? " div" : ""}`} aria-hidden="true">
          <span>{legend.a}</span><i /><span>{legend.b}</span>
        </div>
      </div>

      <p className="note" aria-live="polite">
        {hint ?? (selected ? `${describe(selected)}. La serie de arriba está filtrada; vuelve a tocarlo para quitar el filtro.` : "Toca un departamento para ver su cifra y filtrar la serie. Con ratón, arrastra para girar.")}
      </p>
      <p className="note">
        Altura {indicator === "change" ? "proporcional a la magnitud del cambio; verde sube, ámbar baja" : "y color proporcionales al valor"}. Gris: sin datos.
        {" "}San Andrés y Providencia ampliado ×{ISLAND_ZOOM}. Límites aproximados (Natural Earth), no oficiales.
        {!yearly && " Con datos mensuales, el último año puede estar incompleto."}
      </p>

      <details className="map-table" open={status === "failed"}>
        <summary>Ver la tabla por departamento</summary>
        <div className="table-scroll">
          <table>
            <thead><tr><th scope="col">Departamento</th><th scope="col">{indicator === "total" ? "Total" : indicator === "year" ? year : `Cambio ${year}`}</th></tr></thead>
            <tbody>
              {sorted.map(([k, v]) => <tr key={k} className={k === selected ? "on" : undefined}><th scope="row">{k}</th><td>{fmt(v)}</td></tr>)}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
