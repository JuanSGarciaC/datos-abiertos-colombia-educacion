// Efectos de entrada del tablero (A1, A2, A7 del catálogo). Funciones sin React para poder probarlas en Node.

/** Curva de frenado: arranca rápido y llega suave. t va de 0 a 1. */
export function easeOut(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - (1 - c) ** 3;
}

/** Número que muestra el contador en el instante t (0 a 1). Al terminar es exactamente el valor real. */
export function countAt(target: number, t: number): number {
  return t >= 1 ? target : Math.round(target * easeOut(t));
}

interface Store { getItem(k: string): string | null; setItem(k: string, v: string): void }
const KEY = "tablero-intro-vista";

/** La entrada se ve una vez por sesión (no en cada refresco) y nunca con movimiento reducido. */
export function shouldPlayIntro(reduced: boolean, store: Store | null): boolean {
  if (reduced || !store) return false;
  try {
    if (store.getItem(KEY)) return false;
    store.setItem(KEY, "1");
    return true;
  } catch {
    return false; // almacenamiento bloqueado: mejor sin animación que repetirla siempre
  }
}

interface CountOpts {
  duration?: number;
  raf?: (cb: (now: number) => void) => number;
  caf?: (id: number) => void;
  onDone?: () => void;
}

/** Cuenta de 0 al valor en el texto del elemento. Devuelve una función que la detiene. */
export function countUp(el: { textContent: string | null }, target: number, format: (x: number) => string, opts: CountOpts = {}): () => void {
  const { duration = 1200, raf = requestAnimationFrame, caf = cancelAnimationFrame, onDone } = opts;
  let start: number | null = null;
  let id = 0;
  const tick = (now: number) => {
    start ??= now;
    const t = (now - start) / duration;
    el.textContent = format(countAt(target, t));
    if (t < 1) id = raf(tick);
    else onDone?.();
  };
  el.textContent = format(0);
  id = raf(tick);
  return () => caf(id);
}

type IOCtor = new (cb: IntersectionObserverCallback, opts?: IntersectionObserverInit) => Pick<IntersectionObserver, "observe" | "unobserve" | "disconnect">;

/**
 * Oculta los elementos (data-reveal="wait") y los muestra al entrar en pantalla, en escalera.
 * Se usa un atributo propio y no una clase porque React no lo toca al volver a pintar.
 * Devuelve una función que muestra de golpe lo que siga pendiente y deja de observar.
 */
export function revealOnScroll(els: Iterable<HTMLElement>, IO: IOCtor = IntersectionObserver): () => void {
  const pending = new Set(els);
  const show = (el: HTMLElement, i: number) => {
    el.style.setProperty("--d", String(Math.min(i, 6))); // tope: una fila larga no tarda en aparecer
    el.dataset.reveal = "in";
    pending.delete(el);
  };
  const io = new IO((entries) => {
    let i = 0;
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      show(e.target as HTMLElement, i++);
      io.unobserve(e.target);
    }
  }, { rootMargin: "0px 0px -8% 0px" });
  for (const el of pending) {
    el.dataset.reveal = "wait";
    io.observe(el);
  }
  return () => {
    io.disconnect();
    [...pending].forEach((el) => show(el, 0));
  };
}
