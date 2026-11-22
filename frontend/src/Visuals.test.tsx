import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CountUp } from "./Visuals";

describe("CountUp", () => {
  it("el HTML inicial ya trae la cifra real (sin JS se ve el valor, no un 0)", () => {
    const html = renderToString(<CountUp value={1234567} />);
    const cifra = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(1234567);
    expect(html.split(cifra).length - 1).toBe(2); // copia para lector de pantalla + copia visible
    expect(html).toContain('class="sr-only"');
    expect(html).toContain('aria-hidden="true"');
  });
});
