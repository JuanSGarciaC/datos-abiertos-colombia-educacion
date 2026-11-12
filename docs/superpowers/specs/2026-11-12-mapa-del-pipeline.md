# Mapa del pipeline, ejecución en vivo y conciliación en el tablero

Fecha: 2026-11-12. Rama: `feat/mapa-pipeline`.

## Problema

Lo más valioso del proyecto (la fuente publica cada registro dos veces y la limpieza lo detecta) solo
se lee en `docs/RECONCILIACION.md`. El tablero no muestra el pipeline ni la conciliación, y no hay
forma de ver una ejecución desde la interfaz.

## Alcance

1. **Mapa del pipeline** (`frontend/src/Flow.tsx`): Fuente → Extraer → Validar → Guardar → Analizar →
   Resumir → Conciliar, con cuatro ramas de descarte bajo Validar (copias, fechas inválidas, sin
   categoría, valores inválidos). Grosor de arista proporcional a las filas; una rama con 0 queda
   apagada. Datos: `quality`, `metrics`, `summary` y `reconcile` de `GET /api/overview`.
2. **Ejecución en vivo con datos reales**: `POST /api/run` ejecuta el pipeline contra datos.gov.co
   con el `dataset.yaml` configurado; `GET /api/run` devuelve `{running, stage, rows}`. El tablero
   consulta el progreso y enciende el nodo de la etapa en curso. Una sola ejecución a la vez (409).
   Un fallo de la fuente responde 502 y no toca los datos anteriores.
3. **Conciliación en la interfaz**: la ejecución real compara el total por año con la suma que calcula
   el servidor (`reconcile.py`, ya existente) y lo guarda como artefacto `reconcile` dentro de
   `/api/overview`. Si esa consulta falla, el pipeline termina y el panel dice «sin conciliar».
   En pantalla: barra fantasma de lo publicado detrás de cada barra anual y tabla con la razón.
4. **Tema oscuro único** con la paleta y fuentes de los otros proyectos del portafolio.
5. **Docker**: un `Dockerfile` (la API sirve el tablero compilado) y `docker-compose.yml`.
6. **E2E**: `scripts/tablero.py` (Playwright vía `uv run --with playwright`) comprueba el tablero
   contra el contenedor; con `--real` pulsa «Ejecutar pipeline» y genera capturas y GIF.

## Fuera de alcance

Mapa geográfico, gráficos nuevos, tema claro, pruebas unitarias de frontend, progreso por *streaming*,
probar el redactor con un modelo de lenguaje real (de pago).

## Decisiones

- La muestra sintética se conserva para pruebas y CI (determinista, sin red); no aparece en capturas.
- El progreso vive en memoria del proceso: basta para un solo worker local.
- Las etapas posteriores a la extracción duran milisegundos; el sondeo no las ve una a una. Al
  terminar, el mapa enciende los nodos en secuencia como repaso, no como medición de tiempo.
