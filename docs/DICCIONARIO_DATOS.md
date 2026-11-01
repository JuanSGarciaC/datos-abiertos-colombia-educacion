# Diccionario de datos y reglas de agregación

Fuente: *MEN_ESTADISTICAS MATRICULA POR MUNICIPIOS_ES* (`y9ga-zwzy`), datos.gov.co. Los tipos son
los que declara la API (`/api/views/y9ga-zwzy.json`), consultados el 2026-11-01.

## Columnas de la fuente

| Columna (API) | Tipo | Contenido | Uso en el proyecto |
|---|---|---|---|
| `a_o` | number | Año | Período (`date` = 1 de enero del año) y parte de la clave |
| `c_digo_deldepartamento` | text | Código DIVIPOLA del departamento | No se usa; repite `nombre_del_departamento` |
| `nombre_del_departamento` | text | **Código** DIVIPOLA, a pesar del nombre (`11`, `05` o `5`, `-`) | Categoría, traducida a un nombre con `category_labels` |
| `c_digo_delmunicipio` | text | Código DIVIPOLA del municipio | Parte de la clave para detectar copias |
| `nombre_del_municipio` | text | Nombre del municipio; la grafía varía entre copias | No se usa |
| `tecnica_profesional` | number | Matriculados en nivel técnico profesional | **Se suma** |
| `tecnologica` | number | Matriculados en nivel tecnológico | **Se suma** |
| `universitaria` | number | Matriculados en nivel universitario | **Se suma** |
| `especializacion` | number | Matriculados en especialización | **Se suma** |
| `maestria` | number | Matriculados en maestría | **Se suma** |
| `doctorado` | number | Matriculados en doctorado | **Se suma** |
| `ies_con_oferta` | number | Número de instituciones (IES) con oferta en el municipio | **No se suma**: cuenta instituciones, no estudiantes |

## Columnas que produce el pipeline (`records`, `records.csv`)

| Columna | Definición |
|---|---|
| `date` | 1 de enero de `a_o` |
| `category` | Nombre del departamento (`category_labels` en `config/dataset.yaml`) |
| `value` | Suma de las seis columnas de nivel de formación de la fila |
| `is_outlier` | `true` si `value` queda fuera de Q1 - 1,5·IQR o Q3 + 1,5·IQR, calculado sobre todas las filas |

## Reglas de agregación

1. **Copias:** dos filas con el mismo `a_o` y `c_digo_delmunicipio` y las mismas seis cifras son
   el mismo registro; se conserva una (ver [RECONCILIACION.md](RECONCILIACION.md)).
2. **Departamento `-`:** cuenta como «sin categoría» y se descarta.
3. **Total anual** = suma de `value` de todas las filas del año.
4. **Por departamento** = suma de `value` de sus municipios. Bogotá D.C. es a la vez municipio y
   departamento (`11`).
5. El total es **matrícula por nivel**, no personas únicas: la fuente no permite saber cuántas personas
   distintas hay detrás de cada cifra. Es una cifra descriptiva y no permite inferir causas.
