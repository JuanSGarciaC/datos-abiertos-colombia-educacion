import { describe, expect, it } from "vitest";
import { colorFor, heightsFor, hexToRgb, mix, project, valuesFor, yearsOf, zoomAround } from "./mapData";

const rows = [
  { category: "Antioquia", year: "2020", value: 100 },
  { category: "Antioquia", year: "2021", value: 150 },
  { category: "Chocó", year: "2020", value: 20 },
  { category: "Chocó", year: "2021", value: 10 },
  { category: "Vaupés", year: "2021", value: 5 },
];

describe("valuesFor", () => {
  it("total suma todos los años de cada departamento", () => {
    expect(valuesFor(rows, "total")).toEqual(new Map([["Antioquia", 250], ["Chocó", 30], ["Vaupés", 5]]));
  });
  it("year da el valor del año pedido y omite a quien no tiene fila", () => {
    expect(valuesFor(rows, "year", "2020")).toEqual(new Map([["Antioquia", 100], ["Chocó", 20]]));
  });
  it("year sin año válido usa el último", () => {
    expect(valuesFor(rows, "year", "1999").get("Vaupés")).toBe(5);
  });
  it("change calcula el % frente al año anterior y null si no hay anterior", () => {
    const v = valuesFor(rows, "change", "2021");
    expect(v.get("Antioquia")).toBe(50);
    expect(v.get("Chocó")).toBe(-50);
    expect(v.get("Vaupés")).toBeNull();
  });
  it("change en el primer año no tiene con qué comparar", () => {
    expect([...valuesFor(rows, "change", "2020").values()]).toEqual([null, null]);
  });
});

describe("heightsFor", () => {
  it("normaliza al máximo y no incluye los nulos", () => {
    const h = heightsFor(new Map([["a", 50], ["b", 100], ["c", null]]), "total");
    expect(h).toEqual(new Map([["a", 0.5], ["b", 1]]));
  });
  it("en cambio usa la magnitud", () => {
    expect(heightsFor(new Map([["a", -40], ["b", 20]]), "change")).toEqual(new Map([["a", 1], ["b", 0.5]]));
  });
  it("todo en cero no divide por cero", () => {
    expect(heightsFor(new Map([["a", 0]]), "total").get("a")).toBe(0);
  });
});

describe("colores", () => {
  it("hexToRgb acepta forma corta y larga", () => {
    expect(hexToRgb("#56d4ff")).toEqual([86, 212, 255]);
    expect(hexToRgb("#fff")).toEqual([255, 255, 255]);
  });
  it("mix interpola y recorta t", () => {
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mix("#000000", "#ffffff", 2)).toBe("#ffffff");
  });
  it("cambio negativo va hacia el color de bajada", () => {
    const p = { low: "#000000", high: "#0000ff", up: "#00ff00", down: "#ff0000" };
    expect(colorFor(-10, 1, "change", p)).toBe("#ff0000");
    expect(colorFor(10, 1, "change", p)).toBe("#00ff00");
    expect(colorFor(10, 1, "total", p)).toBe("#0000ff");
  });
});

describe("geometría", () => {
  it("project centra en (-74, 4) y encoge la longitud por cos(4°)", () => {
    expect(project([-74, 4])).toEqual([0, 0]);
    const [x, y] = project([-73, 5]);
    expect(x).toBeCloseTo(Math.cos((4 * Math.PI) / 180));
    expect(y).toBe(1);
  });
  it("yearsOf ordena sin repetir", () => {
    expect(yearsOf(rows)).toEqual(["2020", "2021"]);
  });
  it("zoomAround amplía alrededor del centro", () => {
    expect(zoomAround([[0, 0], [2, 0], [2, 2], [0, 2]], 2)).toEqual([[-1, -1], [3, -1], [3, 3], [-1, 3]]);
  });
});
