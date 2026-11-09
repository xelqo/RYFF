# Backend for Render / Railway / Fly.io (anything that runs a long-lived container).
# Build from the repo root: the backend needs both backend/ and sandbox/.
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/ backend/
COPY sandbox/ sandbox/
COPY docs/AGENT.md docs/AGENT.md
WORKDIR /app/backend
ENV PORT=8000
# ONE worker: sessions live in memory
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
