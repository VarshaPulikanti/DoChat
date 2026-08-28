# Build from repo root (Render default when Dockerfile Path is docker/backend.Dockerfile)
FROM node:20-bookworm-slim

WORKDIR /app

COPY backend/package.json backend/package-lock.json backend/.npmrc ./
RUN npm ci --omit=dev

COPY backend/src ./src

ENV NODE_ENV=production
EXPOSE 5000

CMD ["node", "src/server.js"]
