import type { Overview, RunStatus } from "./types";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const W = 1100, H = 350, Y = 100, YD = 285;

// Nodos HTML colocados con las mismas coordenadas (en %) que las aristas del SVG.
// Mismo orden que pipeline.run: se calcula todo y se guarda al final, de una vez.
const MAIN = ["fuente", "extraer", "validar", "analizar", "resumir", "conciliar", "guardar"] as const;
const X = MAIN.map((_, i) => 85 + i * 155);
const DISCARDS = ["copias", "fechas", "categoria", "valores"] as const;
const XD = DISCARDS.map((_, i) => 163 + i * 155);
const HALF = 62; // medio ancho de un nodo en unidades del viewBox

const at = (x: number, y: number) => ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` });

interface Props { ov: Overview | null; run: RunStatus | null; fresh: boolean }

export default function Flow({ ov, run, fresh }: Props) {
  const q = ov?.quality;
  const demo = ov?.meta.source === "demo-sintetica";
  const yearly = ov?.meta.granularity === "yearly";
  // Etapa en curso: los nodos anteriores quedan encendidos y el actual gira.
  const stage = run ? Math.max(1, MAIN.indexOf(run.stage as (typeof MAIN)[number])) : -1;
  const rowsIn = run ? run.rows : q?.rows_in ?? 0;
  const show = (i: number) => (run ? i === 1 : !!ov); // en curso solo se conoce lo extraído; lo demás sería de la ejecución anterior

  const rec = ov?.reconcile;
  const main: { label: string; count: number | null; sub: string }[] = [
    { label: "Fuente", count: rowsIn, sub: run || !ov ? "datos.gov.co" : demo ? "muestra sintética" : "filas publicadas" },
    { label: "Extraer", count: rowsIn, sub: run && stage === 1 ? "descargando por páginas" : "API SODA, por páginas" },
    { label: "Validar", count: q?.rows_dropped ?? 0, sub: "filas descartadas" },
    { label: "Analizar", count: ov?.metrics.months_complete ?? 0, sub: ov ? `${yearly ? "años" : "meses"} · ${ov.metrics.n_categories ?? 0} categorías` : "períodos y categorías" },
    { label: "Resumir", count: ov?.summary.sentences.length ?? 0, sub: ov ? `frases · ${ov.summary.fallback_count} corregidas` : "frases del resumen" },
    { label: "Conciliar", count: rec?.rows.length ?? 0, sub: rec?.error ? "sin conciliar" : demo ? "no aplica a la muestra" : "años contra la fuente" },
    { label: "Guardar", count: q?.rows_out ?? 0, sub: "filas en SQLite" },
  ];
  const discards = [
    { label: "Copias", count: q?.duplicates_removed ?? 0 },
    { label: "Fechas inválidas", count: q?.invalid_dates ?? 0 },
    { label: "Sin categoría", count: q?.missing_category ?? 0 },
    { label: "Valores inválidos", count: q?.invalid_values ?? 0 },
  ];

  // Grosor proporcional a las filas que pasan por la arista; entre Analizar y Conciliar viajan hechos, no filas.
  const total = q?.rows_in || 1;
  const width = (rows: number) => 2 + 12 * Math.min(1, rows / total);
  const mainRows = [rowsIn, rowsIn, q?.rows_out ?? 0, 0, 0, q?.rows_out ?? 0];
  const settled = !run && !!ov;

  const caption = run
    ? `${stage === 1 ? `Descargando de datos.gov.co: ${nf.format(run.rows)} filas hasta ahora…` : `Etapa en curso: ${run.stage}…`}${ov ? " Abajo siguen los datos de la ejecución anterior." : ""}`
    : ov
      ? `Última ejecución: ${new Date(ov.meta.run_at).toLocaleString("es-CO")} · de ${nf.format(q!.rows_in)} filas recibidas quedaron ${nf.format(q!.rows_out)}.`
      : "Aún no hay datos. Ejecuta el pipeline para descargarlos de datos.gov.co.";

  return (
    <figure className="flow" aria-label="Mapa del pipeline">
      <div className="flow-scroll">
        <div className={`flow-stage${fresh && settled ? " fresh" : ""}`} key={ov?.meta.run_at ?? "vacio"}>
          <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
            {X.slice(0, -1).map((x, i) => {
              const on = run ? i < stage : settled;
              const d = `M${x + HALF},${Y} L${X[i + 1] - HALF},${Y}`;
              return (
                <g key={i} className="edge" opacity={on ? 1 : 0.18}>
                  <path className="edge-track" d={d} strokeWidth={mainRows[i] ? width(mainRows[i]) : 2} opacity={0.3} />
                  {on && <path className="edge-flow" d={d} />}
                </g>
              );
            })}
            {XD.map((x, i) => {
              const on = settled && discards[i].count > 0;
              const d = `M${X[2]},${Y + 52} C${X[2]},${YD - 70} ${x},${Y + 90} ${x},${YD - 36}`;
              return (
                <g key={i} className="edge e-drop" opacity={on ? 1 : 0.18}>
                  <path className="edge-track" d={d} strokeWidth={on ? width(discards[i].count) : 2} opacity={0.3} />
                  {on && <path className="edge-flow" d={d} />}
                </g>
              );
            })}
          </svg>
          <ol role="list" aria-label="Etapas del pipeline">
            {main.map((nd, i) => {
              const state = run ? (i === stage ? " busy" : i < stage ? " lit" : "") : settled ? " lit" : "";
              return (
                <li key={nd.label} className={`node n-${MAIN[i]}${state}`} style={{ ...at(X[i], Y), "--i": i } as React.CSSProperties}>
                  <span className="node-label">{nd.label}</span>
                  <span className="node-count">{show(i) ? nf.format(nd.count ?? 0) : "—"}</span>
                  <span className="node-sub">{nd.sub}</span>
                </li>
              );
            })}
          </ol>
          <ul role="list" aria-label="Descartes de la validación">
            {discards.map((nd, i) => (
              <li key={nd.label} className={`node n-drop${settled && nd.count > 0 ? " lit" : ""}`} style={{ ...at(XD[i], YD), "--i": 2.5 } as React.CSSProperties}>
                <span className="node-label">Descarte</span>
                <span className="node-count">{settled ? nf.format(nd.count) : "—"}</span>
                <span className="node-sub">{nd.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <figcaption className="flow-caption" aria-live="polite">{caption}</figcaption>
    </figure>
  );
}
