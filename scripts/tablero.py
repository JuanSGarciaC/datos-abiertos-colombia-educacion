"""Comprueba el tablero en un navegador real y, con --real, regenera las capturas y el GIF del README.

    uv run --with playwright scripts/tablero.py                                  # comprobaciones (lo que usa el CI)
    uv run --with playwright --with pillow scripts/tablero.py --real --out docs/img

--real pulsa "Ejecutar pipeline": descarga de datos.gov.co y tarda lo que tarde la fuente.
"""
import argparse
import json
import re
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument("--url", default="http://localhost:8090")
ap.add_argument("--channel", default="msedge", help="navegador instalado: msedge o chrome")
ap.add_argument("--real", action="store_true", help="ejecuta el pipeline con datos reales desde la interfaz")
ap.add_argument("--out", default=None, help="carpeta para capturas y GIF (solo con --real)")
args = ap.parse_args()


def overview() -> dict | None:
    try:
        with urllib.request.urlopen(f"{args.url}/api/overview") as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        if e.code == 503:
            return None
        raise


def digits(text: str) -> str:
    return re.sub(r"\D", "", text)


def check_board(page, ov: dict) -> None:
    """Lo que muestra el mapa debe ser lo que devuelve la API."""
    q = ov["quality"]
    expected = {"Fuente": q["rows_in"], "Extraer": q["rows_in"], "Validar": q["rows_dropped"], "Guardar": q["rows_out"],
                "Resumir": len(ov["summary"]["sentences"]), "Conciliar": len(ov["reconcile"]["rows"])}
    for label, value in expected.items():
        node = page.locator(".node", has=page.get_by_text(label, exact=True))
        assert digits(node.locator(".node-count").inner_text()) == str(value), (label, value)
    drops = {"Copias": q["duplicates_removed"], "Fechas inválidas": q["invalid_dates"],
             "Sin categoría": q["missing_category"], "Valores inválidos": q["invalid_values"]}
    for label, value in drops.items():
        node = page.locator(".node.n-drop", has=page.get_by_text(label, exact=True))
        assert digits(node.locator(".node-count").inner_text()) == str(value), (label, value)
        # Una rama sin descartes queda apagada; con descartes, encendida.
        assert ("lit" in node.get_attribute("class").split()) == (value > 0), label
    assert sum(drops.values()) == q["rows_dropped"], "los descartes del mapa no suman lo descartado"
    expect(page.get_by_role("heading", name="Resumen")).to_be_visible()
    expect(page.get_by_role("heading", name="Calidad de los datos")).to_be_visible()
    if ov["reconcile"]["rows"]:
        page.get_by_text("Ver la conciliación año por año").click()
        expect(page.locator("tbody tr")).to_have_count(len(ov["reconcile"]["rows"]))
        assert page.locator("rect.ghost").count() == len(ov["reconcile"]["rows"])


def make_gif(frames: list[Path], out: Path) -> None:
    from PIL import Image

    imgs = [Image.open(p).convert("RGB") for p in frames]
    imgs = [f.resize((800, round(f.height * 800 / f.width)), Image.LANCZOS) for f in imgs]
    # Paleta común (inicio, mitad y final): sin ella cada fotograma trae la suya y el archivo se dispara.
    strip = Image.new("RGB", (800, imgs[0].height * 3))
    for i, f in enumerate((imgs[0], imgs[len(imgs) // 2], imgs[-1])):
        strip.paste(f, (0, i * f.height))
    # Octree conserva los colores vivos; el corte por mediana gasta la paleta en tonos oscuros y el GIF sale gris.
    palette = strip.quantize(255, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    quantized = [f.quantize(palette=palette, dither=Image.Dither.NONE) for f in imgs]
    durations = [120] * (len(quantized) - 1) + [2500]
    quantized[0].save(out, save_all=True, append_images=quantized[1:], duration=durations, loop=0, optimize=True)
    print(len(imgs), "fotogramas,", out.stat().st_size // 1024, "KB")


with sync_playwright() as pw:
    browser = pw.chromium.launch(channel=args.channel)
    page = browser.new_page(viewport={"width": 1180, "height": 620}, device_scale_factor=1)
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(args.url)
    button = page.get_by_role("button", name="Ejecutar pipeline")
    expect(button).to_be_enabled()
    expect(page.get_by_role("figure", name="Mapa del pipeline")).to_be_visible()

    before = overview()
    if before is None:
        expect(page.get_by_text("Aún no hay datos")).to_be_visible()
        errors.clear()  # el 503 de "sin datos" es el estado vacío esperado, no un fallo
    else:
        check_board(page, before)

    if args.real:
        frames: list[Path] = []
        tmp = Path(tempfile.mkdtemp())

        def frame() -> None:
            frames.append(tmp / f"{len(frames):04d}.png")
            page.screenshot(path=frames[-1])

        frame()
        button.click()
        running = page.get_by_role("button", name="Ejecutando…")
        expect(running).to_be_visible()
        expect(page.locator(".node.busy")).to_have_count(1)  # solo gira la etapa en curso
        while running.count():
            frame()
            page.wait_for_timeout(900)
        for _ in range(16):  # repaso nodo a nodo al terminar
            frame()
            page.wait_for_timeout(130)
        expect(page.get_by_role("alert")).to_have_count(0)
        ov = overview()
        assert ov and ov["meta"]["source"].startswith("https://www.datos.gov.co"), "la ejecución no dejó datos reales"
        assert ov["reconcile"]["rows"] and not ov["reconcile"]["error"], ov["reconcile"]
        expect(page.get_by_role("link", name="fuente: datos.gov.co")).to_be_visible()
        if args.out:
            out = Path(args.out)
            make_gif(frames, out / "pipeline-en-vivo.gif")
            page.wait_for_timeout(2500)
            page.locator(".flow").screenshot(path=out / "20-mapa-pipeline.png")
            page.screenshot(path=out / "21-tablero.png", full_page=True)
            page.locator("section", has=page.get_by_role("heading", name="Pipeline frente a lo que publica la fuente")).screenshot(path=out / "22-conciliacion.png")
        check_board(page, ov)

    assert not errors, errors
    browser.close()
print("tablero: comprobaciones en verde")
