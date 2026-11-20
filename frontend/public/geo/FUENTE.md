# colombia-departamentos.json

- **Fuente:** Natural Earth, *Admin 1 – States, Provinces* (escala 1:10m), `ne_10m_admin_1_states_provinces.geojson`
  del repositorio `nvkelso/natural-earth-vector`. **Dominio público.**
- **Qué se hizo:** filtrar `adm0_a3 = COL`; quitar un polígono sin nombre (`CO-X01`); renombrar «Bogota» a
  «Bogotá D.C.» para que coincida con las etiquetas de `config/dataset.yaml`; quitar islotes de menos de
  0,002 grados² (salvo San Andrés y Providencia); simplificar con Douglas-Peucker (tolerancia 0,01°, unos 1,1 km;
  0,0005° en San Andrés) y redondear a 3 decimales.
- **Resultado:** 33 departamentos, 3 649 vértices, 62 KB (18 KB con gzip).
- Es una geometría aproximada para visualizar, no un límite oficial. El límite oficial es el Marco Geoestadístico del DANE.
