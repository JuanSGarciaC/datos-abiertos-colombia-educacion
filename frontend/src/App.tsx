import { useCallback, useEffect, useMemo, useState } from "react";
import { getCategories, getOverview, getSeries } from "./api";
import SamplePanel from "./SamplePanel";
import { AnnualBars, Heatmap, Kpis, YearOverYear } from "./Visuals";
import type { Category, Overview, Quality, SeriesPoint } from "./types";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const n = (x: number) => nf.format(x);

function SeriesChart({ points, anomalies }: { points: SeriesPoint[]; anomalies: string[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = 240, L = 46, R = 12, T = 12, B = 28;
  const max = Math.max(...points.map((p) => p.value), 1);
  const x = (i: number) => L + (points.length > 1 ? (i * (W - L - R)) / (points.length - 1) : 0);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const complete = points.filter((p) => !p.partial);
  const path = (arr: SeriesPoint[], offset = 0) => arr.map((p, i) => `${i ? "L" : "M"}${x(i + offset)},${y(p.value)}`).join("");
  const shown = hover ?? points.length - 1;
  const cur = points[shown];
  const step = Math.max(1, Math.round(points.length / 6));
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.min(points.length - 1, Math.max(0, Math.round(((px - L) / (W - L - R)) * (points.length - 1)))));
  };
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Valor mensual" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line className="grid" x1={L} x2={W - R} y1={y(max * t)} y2={y(max * t)} />
            <text className="tick" x={L - 6} y={y(max * t) + 4} textAnchor="end">{n(max * t)}</text>
          </g>
        ))}
        <path className="line" d={path(complete)} />
        {points.length > complete.length && complete.length > 0 && (
          <path className="line partial" d={`M${x(complete.length - 1)},${y(complete[complete.length - 1].value)}L${x(points.length - 1)},${y(points[points.length - 1].value)}`} />
        )}
        {points.map((p, i) => anomalies.includes(p.month) && <circle key={p.month} className="dot-anomaly" cx={x(i)} cy={y(p.value)} r={5} />)}
        {points.map((p, i) => i % step === 0 && <text key={p.month} className="tick" x={x(i)} y={H - 8} textAnchor="middle">{p.month}</text>)}
        <circle className="dot" cx={x(shown)} cy={y(cur.value)} r={4} />
      </svg>
      <figcaption aria-live="polite">
        <strong>{cur.month}</strong>: {n(cur.value)}
        {cur.partial && <span className="tag warn"> mes incompleto</span>}
        {anomalies.includes(cur.month) && <span className="tag warn"> mes atípico</span>}
      </figcaption>
    </figure>
  );
}

function QualityPanel({ q }: { q: Quality }) {
  const rows: [string, number, string?][] = [
    ["Filas recibidas", q.rows_in],
    ["Filas conservadas", q.rows_out],
    ["Duplicadas eliminadas", q.duplicates_removed, "Filas idénticas en todas sus columnas"],
    ["Fechas inválidas", q.invalid_dates],
    ["Sin categoría", q.missing_category],
    ["Valores inválidos", q.invalid_values],
    ["Valores negativos", q.negative_values, "Se conservan"],
    ["Atípicos marcados", q.outliers_flagged, "Se marcan, no se eliminan"],
  ];
  return (
    <dl className="quality">
      {rows.map(([k, v, hint]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{n(v)}</dd>
          {hint && <small>{hint}</small>}
        </div>
      ))}
      {q.value_is_count && <p className="note">El dataset no tiene columna de valor: cada fila cuenta 1.</p>}
      {q.notes.map((t) => <p className="note" key={t}>{t}</p>)}
    </dl>
  );
}

export default function App() {
  const [ov, setOv] = useState<Overview | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [category, setCategory] = useState("");
  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [full, setFull] = useState<SeriesPoint[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    Promise.all([getOverview(), getCategories(), getSeries()])
      .then(([o, c, f]) => { setOv(o); setCats(c); setFull(f); setCategory(""); })
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  useEffect(() => {
    if (!ov) return;
    getSeries(category || undefined).then(setSeries).catch((e: Error) => setError(e.message));
  }, [ov, category]);

  const maxCat = useMemo(() => Math.max(...cats.map((c) => c.value), 1), [cats]);

  if (error) {
    return (
      <main className="page">
        <h1>No se pudieron cargar los datos</h1>
        <p>{error}</p>
        <p>Ejecuta el pipeline y confirma que el servidor está en <code>localhost:8000</code>.</p>
      </main>
    );
  }
  if (!ov) return <main className="page"><p>Cargando…</p></main>;

  const demo = ov.meta.source === "demo-sintetica";
  const yearly = ov.meta.granularity === "yearly";
  const m = ov.metrics;
  return (
    <main className="page">
      {demo && (
        <p className="banner" role="note">
          Estos son datos sintéticos de demostración. No describen la realidad: no los uses como evidencia ni en capturas de portafolio.
        </p>
      )}
      <header>
        <h1>{ov.meta.dataset_name}</h1>
        <p className="sub">
          {m.date_min} a {m.date_max} · {n(m.rows)} registros ·{" "}
          {demo ? "fuente: sintética" : <a href={ov.meta.source}>fuente: datos.gov.co</a>}
        </p>
      </header>

      <Kpis m={m} series={full} yearly={yearly} />

      {demo && (
        <section aria-labelledby="h-muestra">
          <h2 id="h-muestra">Muestra sintética</h2>
          <p className="note">Cambia los parámetros y regenera: todo el tablero, el resumen y las pruebas de validación se recalculan.</p>
          <SamplePanel onDone={load} />
        </section>
      )}

      <section aria-labelledby="h-res">
        <h2 id="h-res">Resumen</h2>
        <ol className="summary">
          {ov.summary.sentences.map((s) => (
            <li key={s.fact_id}>
              <p>{s.text}</p>
              <details>
                <summary>Ver cifras que lo respaldan</summary>
                <dl className="evidence">
                  {Object.entries(s.evidence).map(([k, v]) => (<div key={k}><dt>{k}</dt><dd>{v}</dd></div>))}
                </dl>
                {s.fallback && <p className="note">El modelo cambió una cifra; se mostró el texto original.</p>}
              </details>
            </li>
          ))}
        </ol>
        <p className="note">
          {ov.summary.provider === "mock" ? "Redactado con reglas fijas, sin modelo de lenguaje." : `Redactado con ${ov.summary.model}.`}{" "}
          El control compara números; no verifica que la interpretación sea correcta.
        </p>
      </section>

      <section aria-labelledby="h-serie">
        <div className="row">
          <h2 id="h-serie">{yearly ? "Valor por año" : "Valor por mes"}</h2>
          <label>
            Categoría{" "}
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Todas</option>
              {cats.map((c) => <option key={c.category}>{c.category}</option>)}
            </select>
          </label>
        </div>
        {series.length > 0 && <SeriesChart points={series} anomalies={category ? [] : m.anomaly_months ?? []} />}
        <p className="note">
          {yearly ? "Los años atípicos solo se señalan en la serie total. No se sabe si el último año está completo." : "Línea discontinua: mes incompleto, fuera del cambio mensual. Los meses atípicos solo se señalan en la serie total."}
          La serie es descriptiva; no pronostica.
        </p>
      </section>

      {yearly ? (
        <section aria-labelledby="h-bars">
          <h2 id="h-bars">Barras por año</h2>
          {series.length > 0 && <AnnualBars series={series} anomalies={category ? [] : m.anomaly_months ?? []} />}
        </section>
      ) : (
        <>
          <section aria-labelledby="h-heat">
            <h2 id="h-heat">Mapa de calor: mes por año</h2>
            {series.length > 0 && <Heatmap series={series} />}
          </section>
          <section aria-labelledby="h-yoy">
            <h2 id="h-yoy">Año contra año</h2>
            {series.length > 0 && <YearOverYear series={series} />}
            <p className="note">Cada línea es un año; la más gruesa es el más reciente. El punto ámbar es un mes incompleto.</p>
          </section>
        </>
      )}

      <section aria-labelledby="h-cat">
        <h2 id="h-cat">Valor por categoría</h2>
        <ul className="bars">
          {cats.slice(0, 10).map((c) => (
            <li key={c.category}>
              <button className={c.category === category ? "on" : ""} onClick={() => setCategory(c.category === category ? "" : c.category)}>
                <span className="name">{c.category}</span>
                <span className="bar"><i style={{ width: `${(c.value / maxCat) * 100}%` }} /></span>
                <span className="val">{n(c.value)}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="note">Toca una categoría para filtrar la serie.</p>
      </section>

      <section aria-labelledby="h-cal">
        <h2 id="h-cal">Calidad de los datos</h2>
        <QualityPanel q={ov.quality} />
      </section>

      <footer className="note">Última ejecución: {new Date(ov.meta.run_at).toLocaleString("es-CO")}</footer>
    </main>
  );
}
