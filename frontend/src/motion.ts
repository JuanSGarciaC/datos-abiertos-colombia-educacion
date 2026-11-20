// Utilidades de movimiento compartidas: contador (A7) y aparición al entrar en pantalla (H1).
import { useCallback, useLayoutEffect, useRef, useState } from "react";

/** Valor animado del contador (A7): sale rápido y frena al final (easeOutCubic). t va de 0 a 1. */
export function countUpValue(from: number, to: number, t: number): number {
  const k = Math.min(1, Math.max(0, t));
  return from + (to - from) * (1 - (1 - k) ** 3);
}

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A7 count-up: devuelve el número a mostrar. El primer render ya trae el valor final (legible sin animación);
 * la animación se prepara antes del pintado (useLayoutEffect) y un temporizador garantiza que termine en el valor real.
 */
export function useCountUp(target: number, ms = 900): number {
  const [shown, setShown] = useState(target);
  const prev = useRef(0); // la primera vez cuenta desde 0; después, desde la cifra anterior
  useLayoutEffect(() => {
    const from = prev.current;
    // prev solo cambia al terminar: si StrictMode desmonta y vuelve a montar, la animación arranca otra vez desde el mismo punto.
    const done = () => { prev.current = target; setShown(target); };
    if (reducedMotion() || from === target) { done(); return; }
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const t = (now - t0) / ms;
      if (t >= 1) { done(); return; }
      setShown(countUpValue(from, target, t));
      raf = requestAnimationFrame(step);
    };
    setShown(from);
    raf = requestAnimationFrame(step);
    const safety = setTimeout(() => { cancelAnimationFrame(raf); done(); }, ms + 1000);
    return () => { cancelAnimationFrame(raf); clearTimeout(safety); };
  }, [target, ms]);
  return shown;
}

/**
 * H1: marca el elemento para que sus barras crezcan al entrar en pantalla. Solo «arma» (oculta) lo que aún está
 * fuera de la vista, y solo si el script corrió; con reduced-motion o sin IntersectionObserver no hace nada.
 * Es una callback ref: funciona aunque el elemento aparezca después del primer render.
 * A los 5 s se revela de todos modos.
 */
export function useReveal<T extends HTMLElement>(): (el: T | null) => void {
  const cleanup = useRef<() => void>();
  return useCallback((el: T | null) => {
    cleanup.current?.();
    cleanup.current = undefined;
    if (!el || reducedMotion() || !("IntersectionObserver" in window)) return;
    const reveal = () => { el.dataset.in = ""; delete el.dataset.armed; };
    if (el.getBoundingClientRect().top < innerHeight) { reveal(); return; }
    el.dataset.armed = "";
    const io = new IntersectionObserver(([en]) => { if (en.isIntersecting) { reveal(); io.disconnect(); } }, { threshold: 0.2 });
    io.observe(el);
    // Seguridad: lo armado nunca queda oculto para siempre (capturas de página completa, impresión, observadores que no disparan).
    const safety = setTimeout(reveal, 5000);
    addEventListener("beforeprint", reveal);
    cleanup.current = () => { io.disconnect(); clearTimeout(safety); removeEventListener("beforeprint", reveal); };
  }, []);
}
