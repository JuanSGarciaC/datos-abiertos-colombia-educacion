# Conciliación independiente del total y perfil de calidad

Medido el 2026-11-01 contra la API de datos.gov.co (dataset `y9ga-zwzy`, 19 618 filas publicadas).
Para repetirlo, desde `backend/` con el entorno activo:

```powershell
python -m app.pipeline run --config ../config/dataset.yaml
python -m app.reconcile --config ../config/dataset.yaml
```

`app/reconcile.py` le pide al **servidor** la suma por año (`$select=a_o, sum(...)`, `$group=a_o`).
Esa cifra no pasa por el código de este proyecto, por eso sirve como contraste.

## Hallazgo: la fuente publica cada registro dos veces (2005-2020)

En 2005-2020 casi todos los municipios aparecen dos veces por año con **las mismas cifras**. A
veces las dos filas son idénticas y a veces cambia solo un texto:

| Año | Municipio | `nombre_del_municipio` | Universitaria | Maestría |
|---|---|---|---|---|
| 2016 | 11001 | `BOGOTÁ D.C.` | 507 209 | 25 120 |
| 2016 | 11001 | `SANTAFE DE BOGOTA` | 507 209 | 25 120 |

Antes de este cambio el pipeline solo quitaba filas idénticas en **todas** las columnas. Así se
quitaban 6 330 copias, pero quedaban 3 299 que solo cambiaban de grafía del municipio o del código
de departamento (`5` frente a `05`). El resultado era una serie mezclada: algunos años quedaban
contados una vez y medio, y 2020 quedaba **doble** del todo. El tablero mostraba una caída del
-48 % entre 2020 y 2021 que no existe.

**Corrección:** `config/dataset.yaml` declara la clave `key: ["a_o", "c_digo_delmunicipio"]`. Las
filas con la misma clave y las **mismas cifras** son copias. Las filas con la misma clave y cifras
distintas se conservan: hay 1 204 de ese tipo (por ejemplo, Valledupar 2005 tiene dos registros
distintos) y se suman, como antes.

## Conciliación por año

| Año | Pipeline | Suma publicada (servidor) | Filas publicadas | Fuente / pipeline |
|---|---|---|---|---|
| 2005 | 1 196 690 | 2 393 380 | 736 | 2,0 |
| 2006 | 1 281 681 | 2 563 362 | 956 | 2,0 |
| 2007 | 1 362 498 | 2 725 018 | 1 332 | 2,0 |
| 2008 | 1 491 531 | 2 983 062 | 1 404 | 2,0 |
| 2009 | 1 593 166 | 3 186 422 | 1 502 | 2,0001 |
| 2010 | 1 673 738 | 3 348 042 | 1 654 | 2,0003 |
| 2011 | 1 859 444 | 3 719 384 | 1 642 | 2,0003 |
| 2012 | 1 929 382,6 | 3 859 173,2 | 1 714 | 2,0002 |
| 2013 | 2 092 730 | 4 185 782 | 1 654 | 2,0002 |
| 2014 | 2 220 652 | 4 441 304 | 1 236 | 2,0 |
| 2015 | 2 293 550 | 4 587 100 | 1 274 | 2,0 |
| 2016 | 2 394 434 | 4 788 868 | 818 | 2,0 |
| 2017 | 2 446 314 | 4 892 628 | 838 | 2,0 |
| 2018 | 2 440 367 | 4 880 734 | 626 | 2,0 |
| 2019 | 2 396 250 | 4 792 500 | 1 052 | 2,0 |
| 2020 | 2 355 603 | 4 711 206 | 820 | 2,0 |
| 2021 | 2 448 271 | 2 448 271 | 360 | 1,0 |

- **Razón 2,0 exacta:** cada registro se publicó dos veces y la limpieza dejó uno.
- **Razón 2,0001-2,0003 (2009-2013):** además se descartaron filas con departamento `-`
  («NO IDENTIFICADO»). Son 6 filas en total; en 2007, por ejemplo, la diferencia son 11 estudiantes.
- **2021, razón 1,0:** ese año viene publicado una sola vez.

### Contraste con cifras oficiales publicadas

| Variación | Pipeline (después) | Pipeline (antes) | Cifra publicada |
|---|---|---|---|
| 2021 frente a 2020 | +3,93 % | -48 % | +3,93 %, según el Ministerio de Educación ([Valora Analitik](https://www.valoraanalitik.com/?p=182423)) |
| 2020 frente a 2019 | -1,7 % | +48,7 % | -1,7 % ([CINDA, Informe Colombia 2024](https://cinda.cl/wp-content/uploads/2024/07/Educacion-Superior-en-Iberoamerica-2024-Informe-Colombia.pdf)) |

Las dos variaciones coinciden con lo publicado. No se encontró publicada la cifra absoluta
(2 448 271 para 2021) en una fuente oficial consultable; se contrastan solo las variaciones.

## ¿Está completo el último año?

2021 lista 360 municipios, frente a 410 en 2020. Aun así, el total crece un 3,93 %, igual que la
cifra oficial del Ministerio, así que 2021 se trata como año completo. El número de municipios
cambia mucho de un año a otro en toda la serie (313 en 2018, 526 en 2019), así que no es una
señal de año parcial; la causa no está documentada en la ficha. La ficha declara la cobertura
2005-2021, y la fuente no tiene datos posteriores a 2021.

## Perfil de calidad (antes y después de la limpieza)

| Medida | Valor | Tratamiento |
|---|---|---|
| Filas recibidas | 19 618 | — |
| Copias (misma clave y mismas cifras) | 9 629 | Se eliminan (6 330 idénticas + 3 299 con otro texto) |
| Sin departamento (`-`, «NO IDENTIFICADO») | 6 | Se eliminan y se cuentan |
| Fechas o valores inválidos | 0 | — |
| Valores negativos | 0 | — |
| **Filas conservadas** | **9 983** | — |
| Códigos de departamento sin cero inicial (`5`, `8`) | 2 784 filas publicadas | Se unifican con `05` y `08` mediante `category_labels` |
| Valores no enteros (conteos de estudiantes) | 2 registros de 2012 (Bogotá 11001 y Cartagena 13001) | Se conservan; probablemente un error de la fuente. Por eso el total de 2012 tiene decimales |
| Atípicos marcados (regla IQR, por fila) | 1 735 | Se marcan, no se eliminan. Las filas son municipios, y las capitales salen atípicas por tamaño, no por error |

## Límites

- La regla de copias asume que dos registros distintos del mismo municipio y año no tienen
  exactamente las mismas seis cifras. Si eso ocurriera con valores pequeños, se perdería uno.
- La conciliación con el servidor demuestra que la limpieza es consistente con lo publicado, no que
  la fuente sea correcta. El contraste externo se limita a las dos variaciones anuales citadas.
