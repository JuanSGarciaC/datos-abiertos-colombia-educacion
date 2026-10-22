# Tablero de datos abiertos de Colombia con resumen automático

Pipeline que descarga un dataset de datos.gov.co (API SODA), lo valida, lo guarda en SQLite,
calcula estadística descriptiva y genera un resumen con control de cifras. Tablero en React.

## Ejecutar (Windows, PowerShell)
```powershell
# Backend
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy ..\.env.example .env
pytest -q
python -m app.pipeline run --sample        # datos sintéticos (solo desarrollo)
uvicorn app.api:app --reload               # http://localhost:8000/docs

# Frontend (otra terminal)
cd frontend
npm install
npm run dev                                # http://localhost:5173
```

## Editar la muestra sintética
- **Desde el tablero:** panel "Editar la muestra" (fechas, categorías y pesos, tendencia, mes atípico, semilla). Regenera todo.
- **Desde archivo:** edita `config/sample.yaml` y ejecuta `python -m app.pipeline run --sample --sample-config ../config/sample.yaml`.
- Con datos reales en la base, el panel no aparece y la API se niega a sobrescribirlos (error 409).

## Pasar a un dataset real
1. Elige un dataset en datos.gov.co con una columna de fecha y una categórica.
2. Edita `config/dataset.yaml` (id y nombres EXACTOS de columnas).
3. `python -m app.pipeline run --config ../config/dataset.yaml`
4. Haz las capturas del portafolio solo con esos datos.

## Dataset configurado
`config/dataset.yaml` apunta a `y9ga-zwzy` (matrícula de educación superior por municipio, MEN), con serie **anual**.
Antes de correr, verifica en el navegador los nombres de columnas (ver comentarios del YAML).
Soporta `granularity: daily | monthly | yearly` y `value_columns` (suma de conteos; nunca sumes tasas ni promedios).

## Qué NO afirmar
Datos sintéticos como reales, "predicciones" (es descriptivo), o impacto/cifras que no calculaste tú.
