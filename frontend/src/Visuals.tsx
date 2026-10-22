import { useState } from "react";
import type { Metrics, SeriesPoint } from "./types";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const n = (x: number) => nf.format(x);
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function Spark({ points }: { points: SeriesPoint[] }) {
  const pts = points.filter((p) => !p.partial).slice(-18);
  if (pts.length < 2) return null;
  const max = Math.max(...pts.map((p) => p.value)), min = Math.min(...pts.map((p) => p.value));
  const d = pts.map((p, i) => `${i ? "L" : "M"}${(i / (pts.length - 1)) * 100},${28 - ((p.value - min) / (max - min || 1)) * 24 - 2}`).join("");
  return <svg className="spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true"><path d={d} /></svg>;
}

export function Kpis({ m, series, yearly }: { m: Metrics; series: SeriesPoint[]; yearly: boolean }) {
  const top = m.top_categories?.[0];
  const ch = m.change_pct;
  return (
    <div className="kpis">
      <div><span className="k">Total</span><b>{n(m.total_value ?? 0)}</b><Spark points={series} /></div>
      {m.last_month && (
        <div>
          <span className="k">{yearly ? "Último año" : "Último mes completo"} · {m.last_month}</span>
          <b>{n(m.last_value ?? 0)}</b>
          <span className={`delta ${ch == null ? "" : ch > 0 ? "up" : "down"}`}>
            {ch == null ? "sin comparación" : `${ch > 0 ? "▲ +" : ch < 0 ? "▼ " : ""}${ch.toLocaleString("es-CO")} % vs ${m.prev_month}`}
          </span>
        </div>
      )}
      {top && <div><span className="k">Categoría líder</span><b>{top.category}</b><span className="delta">{(top.share ?? 0).toLocaleString("es-CO")} % del total</span></div>}
      <div>
        <span className="k">{yearly ? "Años atípicos" : "Meses atípicos"}</span>
        <b>{m.anomaly_months ? m.anomaly_months.length : "n/d"}</b>
        <span className="delta">{m.anomaly_months?.length ? m.anomaly_months.join(", ") : "ninguno detectado"}</span>
      </div>
    </div>
  );
}

export function Heatmap({ series }: { series: SeriesPoint[] }) {
  const [sel, setSel] = useState<SeriesPoint | null>(null);
  const by = new Map(series.map((p) => [p.month, p]));
  const years = [...new Set(series.map((p) => p.month.slice(0, 4)))];
  const max = Math.max(...series.map((p) => p.value), 1);
  return (
    <div>
      <div className="heat" role="table" aria-label="Valor por mes y año">
        <span />
        {MESES.map((m) => <span key={m} className="hh">{m}</span>)}
        {years.map((y) => (
          <div className="hrow" key={y} role="row">
            <span className="hy">{y}</span>
            {MESES.map((_, i) => {
              const p = by.get(`${y}-${String(i + 1).padStart(2, "0")}`);
              if (!p) return <span key={i} className="hc empty" />;
              const pct = 12 + 78 * (p.value / max);
              return (
                <button key={i} className={`hc${p.partial ? " partial" : ""}`} style={{ background: `color-mix(in srgb, var(--accent) ${pct}%, var(--surface))` }}
                  aria-label={`${p.month}: ${n(p.value)}${p.partial ? " (incompleto)" : ""}`}
                  onPointerEnter={() => setSel(p)} onFocus={() => setSel(p)} onClick={() => setSel(p)} />
              );
            })}
          </div>
        ))}
      </div>
      <p className="note" aria-live="polite">
        {sel ? <><strong>{sel.month}</strong>: {n(sel.value)}{sel.partial && " (mes incompleto)"}</> : "Más oscuro = más valor. Toca una celda para ver la cifra."}
      </p>
    </div>
  );
}

export function YearOverYear({ series }: { series: SeriesPoint[] }) {
  const W = 640, H = 220, L = 46, R = 44, T = 12, B = 26;
  const years = [...new Set(series.map((p) => p.month.slice(0, 4)))];
  const max = Math.max(...series.map((p) => p.value), 1);
  const x = (mi: number) => L + (mi / 11) * (W - L - R);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="yoy" role="img" aria-label="Comparación año contra año">
      {[0, 0.5, 1].map((t) => (
        <g key={t}><line className="grid" x1={L} x2={W - R} y1={y(max * t)} y2={y(max * t)} />
          <text className="tick" x={L - 6} y={y(max * t) + 4} textAnchor="end">{n(max * t)}</text></g>
      ))}
      {MESES.map((m, i) => <text key={m} className="tick" x={x(i)} y={H - 8} textAnchor="middle">{m}</text>)}
      {years.map((yr, k) => {
        const pts = series.filter((p) => p.month.startsWith(yr)).map((p) => ({ mi: Number(p.month.slice(5)) - 1, p }));
        const last = pts[pts.length - 1];
        const rank = years.length > 1 ? k / (years.length - 1) : 1;
        const d = pts.map((q, i) => `${i ? "L" : "M"}${x(q.mi)},${y(q.p.value)}`).join("");
        return (
          <g key={yr} opacity={0.35 + 0.65 * rank}>
            <path d={d} fill="none" stroke="var(--accent)" strokeWidth={k === years.length - 1 ? 3 : 1.8} strokeLinejoin="round" />
            {last?.p.partial && <circle cx={x(last.mi)} cy={y(last.p.value)} r={4} fill="var(--warn)" />}
            {last && <text className="tick" fill="var(--ink)" x={x(last.mi) + 6} y={y(last.p.value) + 4}>{yr}</text>}
          </g>
        );
      })}
    </svg>
  );
}

export function AnnualBars({ series, anomalies }: { series: SeriesPoint[]; anomalies: string[] }) {
  const [sel, setSel] = useState<SeriesPoint | null>(null);
  const W = 640, H = 220, L = 52, R = 8, T = 10, B = 26;
  const max = Math.max(...series.map((p) => p.value), 1);
  const slot = (W - L - R) / Math.max(series.length, 1);
  const step = Math.max(1, Math.round(series.length / 8));
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="yoy" role="img" aria-label="Valor por año">
        {[0, 0.5, 1].map((t) => (
          <g key={t}><line className="grid" x1={L} x2={W - R} y1={T + (1 - t) * (H - T - B)} y2={T + (1 - t) * (H - T - B)} />
            <text className="tick" x={L - 6} y={T + (1 - t) * (H - T - B) + 4} textAnchor="end">{n(max * t)}</text></g>
        ))}
        {series.map((p, i) => {
          const h = (p.value / max) * (H - T - B);
          return (
            <g key={p.month}>
              <rect x={L + i * slot + slot * 0.12} y={H - B - h} width={slot * 0.76} height={Math.max(h, 0)} rx={2}
                fill={anomalies.includes(p.month) ? "var(--warn)" : "var(--accent)"} opacity={sel?.month === p.month ? 1 : 0.8}
                tabIndex={0} role="img" aria-label={`${p.month}: ${n(p.value)}`}
                onPointerEnter={() => setSel(p)} onFocus={() => setSel(p)} onClick={() => setSel(p)} />
              {i % step === 0 && <text className="tick" x={L + i * slot + slot / 2} y={H - 8} textAnchor="middle">{p.month}</text>}
            </g>
          );
        })}
      </svg>
      <p className="note" aria-live="polite">
        {sel ? <><strong>{sel.month}</strong>: {n(sel.value)}{anomalies.includes(sel.month) && " (año atípico)"}</> : "Toca una barra para ver la cifra. Ámbar = año atípico."}
      </p>
    </div>
  );
}
