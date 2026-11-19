FROM node:22-bookworm-slim AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.11-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=10000 FRONTEND_DIST=/app/frontend
WORKDIR /app
COPY backend/requirements-production.txt ./
RUN pip install --no-cache-dir -r requirements-production.txt \
    && useradd --uid 10001 --no-create-home isa
COPY backend/app ./app
COPY --from=frontend /build/dist ./frontend
USER isa
EXPOSE 10000
CMD ["python", "-m", "app.production"]
