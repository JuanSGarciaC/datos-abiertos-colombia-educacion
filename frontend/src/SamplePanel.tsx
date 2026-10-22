import { useEffect, useState } from "react";
import { getSampleParams, postSample } from "./api";
import type { SampleParams } from "./types";

const toText = (p: SampleParams) => p.categories.map((c) => `${c.name}, ${c.weight}`).join("\n");

function parseCats(text: string) {
  return text.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const i = l.lastIndexOf(",");
    if (i < 0) throw new Error(`Línea sin peso: "${l}". Usa "Nombre, peso".`);
    const weight = Number(l.slice(i + 1).replace(",", "."));
    if (!Number.isFinite(weight) || weight <= 0) throw new Error(`Peso inválido en: "${l}".`);
    return { name: l.slice(0, i).trim(), weight };
  });
}

export default function SamplePanel({ onDone }: { onDone: () => void }) {
  const [p, setP] = useState<SampleParams | null>(null);
  const [cats, setCats] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reset = () => getSampleParams().then((d) => { setP(d); setCats(toText(d)); setErr(null); }).catch((e: Error) => setErr(e.message));
  useEffect(() => { void reset(); }, []);
  if (!p) return err ? <p className="note">{err}</p> : null;

  const set = <K extends keyof SampleParams>(k: K, v: SampleParams[K]) => setP({ ...p, [k]: v });
  const submit = async () => {
    setBusy(true); setErr(null);
    try { await postSample({ ...p, categories: parseCats(cats) }); onDone(); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <details className="sample">
      <summary>Editar la muestra</summary>
      <div className="grid-form">
        <label>Desde<input type="date" value={p.start} onChange={(e) => set("start", e.target.value)} /></label>
        <label>Hasta<input type="date" value={p.end} onChange={(e) => set("end", e.target.value)} /></label>
        <label>Nivel general<input type="number" min={1} max={500} value={p.base_level} onChange={(e) => set("base_level", Number(e.target.value))} /></label>
        <label>Tendencia (% por mes)<input type="number" step="0.1" value={p.growth_pct_per_month} onChange={(e) => set("growth_pct_per_month", Number(e.target.value))} /></label>
        <label>Mes atípico<input type="month" value={p.anomaly_month ?? ""} onChange={(e) => set("anomaly_month", e.target.value || null)} /></label>
        <label>Multiplicador del atípico<input type="number" step="0.1" min={0.1} max={10} value={p.anomaly_factor} onChange={(e) => set("anomaly_factor", Number(e.target.value))} /></label>
        <label>Semilla aleatoria<input type="number" value={p.seed} onChange={(e) => set("seed", Number(e.target.value))} /></label>
        <label className="check"><input type="checkbox" checked={p.add_dirty_rows} onChange={(e) => set("add_dirty_rows", e.target.checked)} />Incluir filas sucias y duplicadas</label>
        <label className="wide">Categorías (una por línea: nombre, peso)
          <textarea rows={7} value={cats} onChange={(e) => setCats(e.target.value)} />
        </label>
      </div>
      {err && <p className="error" role="alert">{err}</p>}
      <div className="actions">
        <button className="primary" onClick={submit} disabled={busy}>{busy ? "Generando…" : "Regenerar muestra"}</button>
        <button onClick={() => void reset()} disabled={busy}>Restablecer valores</button>
      </div>
    </details>
  );
}
