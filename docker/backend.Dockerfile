# Build from repository root. ChromaDB runs in this same container so the
# Node backend reaches it over localhost instead of the Cloudflare-protected
# public Render URL.
FROM node:20-bookworm-slim

WORKDIR /app

# Install Python + ChromaDB server in an isolated virtual environment.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/chroma-venv \
    && /opt/chroma-venv/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/chroma-venv/bin/pip install --no-cache-dir "chromadb==1.0.0"

COPY backend/package.json backend/package-lock.json backend/.npmrc ./
RUN npm ci --omit=dev

COPY backend/src ./src
COPY docker/start-backend-with-chroma.sh ./start-backend-with-chroma.sh

ENV NODE_ENV=production
ENV CHROMA_URL=http://127.0.0.1:8000
ENV IS_PERSISTENT=TRUE
ENV ANONYMIZED_TELEMETRY=FALSE
ENV OMP_NUM_THREADS=1
ENV OPENBLAS_NUM_THREADS=1

EXPOSE 5000

CMD ["bash", "./start-backend-with-chroma.sh"]
