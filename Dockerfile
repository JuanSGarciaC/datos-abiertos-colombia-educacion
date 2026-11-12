# Un solo contenedor: la API sirve el tablero ya compilado.
FROM node:22-alpine AS tablero
WORKDIR /tablero
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app/backend
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY config /app/config
COPY --from=tablero /tablero/dist /app/frontend/dist
# La base, los JSON crudos y el CSV van a ./data (rutas por defecto), que apunta al volumen /data.
RUN useradd --create-home app && mkdir /data && chown app /data && ln -s /data /app/backend/data
USER app
EXPOSE 8000
HEALTHCHECK --interval=5s --timeout=3s --retries=10 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')"
CMD ["uvicorn", "app.api:app", "--host", "0.0.0.0", "--port", "8000"]
