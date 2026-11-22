import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { shouldPlayIntro } from "./motion";
import "./styles.css";

// Entrada animada (aparición de tarjetas, cifras que cuentan): solo en la primera carga de la sesión.
let store: Storage | null = null;
try { store = sessionStorage; } catch { /* almacenamiento bloqueado */ }
if (shouldPlayIntro(matchMedia("(prefers-reduced-motion: reduce)").matches, store)) document.documentElement.dataset.intro = "1";

// Brillo de las tarjetas: sigue al puntero (variables que lee styles.css).
document.addEventListener("pointermove", (e) => {
  const el = (e.target as Element).closest?.<HTMLElement>(".card");
  if (!el) return;
  const r = el.getBoundingClientRect();
  el.style.setProperty("--mx", `${e.clientX - r.left}px`);
  el.style.setProperty("--my", `${e.clientY - r.top}px`);
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
