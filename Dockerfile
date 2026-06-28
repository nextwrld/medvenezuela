# ─── MVP Deploy Hardening — Dockerfile ────────────────────────────
# Multi-stage build: deps + build → lean runtime
# Node 20 LTS, ESM, serves dist/boot.js + dist/public

# ─── Stage 1: Build ──────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /build

# Copy lockfile + manifests first for layer caching
COPY app/package.json app/package-lock.json* ./

# Reproducible install — npm ci strictly respects package-lock.json
RUN npm ci

# Copy the rest of the source
COPY app/ ./

# Build-time env (placeholders — the app validates but won't call Kimi if nobody uses OAuth)
ARG VITE_KIMI_AUTH_URL=https://placeholder.example.com
ARG VITE_APP_ID=placeholder
ENV VITE_KIMI_AUTH_URL=${VITE_KIMI_AUTH_URL}
ENV VITE_APP_ID=${VITE_APP_ID}

# Build: vite (frontend) + esbuild (server bundle)
RUN npm run build

# ─── Stage 2: Runtime ────────────────────────────────────────────
FROM node:20-slim AS runtime

WORKDIR /app

# Install production deps + drizzle-kit (needed for migrations at startup)
COPY app/package.json app/package-lock.json* ./
RUN npm ci --omit=dev
RUN npm install drizzle-kit@0.31.10

# Copy built artifacts
COPY --from=builder /build/dist ./dist

# Copy Drizzle config + migrations (for db:migrate on startup)
COPY app/drizzle.config.ts ./
COPY app/db/ ./db/

# Copy contracts (shared types needed at runtime)
COPY app/contracts/ ./contracts/

# Production env
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Run migrations then start the server
CMD ["sh", "-c", "npx drizzle-kit migrate && node dist/boot.js"]
