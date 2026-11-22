import { describe, expect, it } from "vitest";
import { countAt, countUp, easeOut, revealOnScroll, shouldPlayIntro } from "./motion";

describe("easeOut", () => {
  it("va de 0 a 1 y se limita fuera del rango", () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(-1)).toBe(0);
    expect(easeOut(2)).toBe(1);
    expect(easeOut(0.5)).toBeGreaterThan(0.5); // frena al final: a mitad de tiempo ya pasó la mitad
  });
});

describe("countAt", () => {
  it("termina exactamente en el valor real, también con decimales", () => {
    expect(countAt(1234567, 1)).toBe(1234567);
    expect(countAt(10.75, 1)).toBe(10.75);
    expect(countAt(1234567, 0)).toBe(0);
  });
});

describe("shouldPlayIntro", () => {
  const store = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };
  it("solo la primera vez de la sesión", () => {
    const s = store();
    expect(shouldPlayIntro(false, s)).toBe(true);
    expect(shouldPlayIntro(false, s)).toBe(false);
  });
  it("nunca con movimiento reducido ni sin almacenamiento", () => {
    expect(shouldPlayIntro(true, store())).toBe(false);
    expect(shouldPlayIntro(false, null)).toBe(false);
  });
  it("si el almacenamiento falla, no anima", () => {
    const broken = { getItem: () => { throw new Error("bloqueado"); }, setItem: () => {} };
    expect(shouldPlayIntro(false, broken)).toBe(false);
  });
});

describe("countUp", () => {
  // Reloj falso: cada llamada a frame(ms) ejecuta el fotograma pendiente.
  const clock = () => {
    let cb: ((now: number) => void) | null = null;
    return {
      raf: (f: (now: number) => void) => { cb = f; return 1; },
      caf: () => { cb = null; },
      frame: (now: number) => { const f = cb; cb = null; f?.(now); },
    };
  };
  const fmt = (x: number) => String(x);

  it("empieza en 0, pasa por valores intermedios y termina en el real", () => {
    const c = clock();
    const el = { textContent: "" as string | null };
    let done = false;
    countUp(el, 1000, fmt, { duration: 100, raf: c.raf, caf: c.caf, onDone: () => (done = true) });
    expect(el.textContent).toBe("0");
    c.frame(0);
    c.frame(50);
    const mid = Number(el.textContent);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1000);
    c.frame(100);
    expect(el.textContent).toBe("1000");
    expect(done).toBe(true);
  });

  it("se puede detener", () => {
    const c = clock();
    const el = { textContent: "" as string | null };
    let done = false;
    const stop = countUp(el, 1000, fmt, { duration: 100, raf: c.raf, caf: c.caf, onDone: () => (done = true) });
    stop();
    c.frame(200);
    expect(el.textContent).toBe("0");
    expect(done).toBe(false);
  });
});

describe("revealOnScroll", () => {
  const fakeEl = () => {
    const props: Record<string, string> = {};
    return { dataset: {} as Record<string, string>, style: { setProperty: (k: string, v: string) => (props[k] = v) }, props };
  };
  // Observador falso: guarda la función para disparar "entró en pantalla" a mano.
  let fire: (targets: unknown[]) => void = () => {};
  let observed = new Set<unknown>();
  class FakeIO {
    constructor(cb: IntersectionObserverCallback) {
      fire = (targets) => cb(targets.map((target) => ({ target, isIntersecting: true })) as unknown as IntersectionObserverEntry[], this as unknown as IntersectionObserver);
    }
    observe(el: unknown) { observed.add(el); }
    unobserve(el: unknown) { observed.delete(el); }
    disconnect() { observed.clear(); }
  }

  it("oculta, muestra en escalera lo que entra y al final destapa lo pendiente", () => {
    observed = new Set();
    const els = [fakeEl(), fakeEl(), fakeEl()];
    const finish = revealOnScroll(els as unknown as HTMLElement[], FakeIO);
    expect(els.map((e) => e.dataset.reveal)).toEqual(["wait", "wait", "wait"]);

    fire([els[0], els[1]]);
    expect(els[0].dataset.reveal).toBe("in");
    expect(els[1].props["--d"]).toBe("1"); // el segundo del lote entra después
    expect(els[2].dataset.reveal).toBe("wait");
    expect(observed.size).toBe(1);

    finish();
    expect(els[2].dataset.reveal).toBe("in");
    expect(observed.size).toBe(0);
  });
});
