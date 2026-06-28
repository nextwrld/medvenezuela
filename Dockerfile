# ─── MVP Deploy Hardening — Dockerfile ────────────────────────────
# Multi-stage build: deps + build → lean runtime
# Node 20 LTS, ESM, serves dist/boot.js + dist/public

# ─── Stage 1: Build ──────────────────────────────────────────────
FROM node:20-slim AS builder

# Install pnpm globally
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /build

# Build stage needs devDeps — force NODE_ENV so pnpm doesn't skip them
ENV NODE_ENV=development

# Copy lockfile + manifests first for layer caching
# pnpm-workspace.yaml is excluded — it was auto-generated and breaks pnpm run
COPY app/package.json app/pnpm-lock.yaml ./

# Install all deps via pnpm (matches the project)
RUN pnpm install --frozen-lockfile

# Verify the binaries exist before build
RUN ls node_modules/.bin/vite node_modules/.bin/esbuild

# Copy the rest of the source
COPY app/ ./

# Build-time env (placeholders — the app validates but won't call Kimi if nobody uses OAuth)
ARG VITE_KIMI_AUTH_URL=https://placeholder.example.com
ARG VITE_APP_ID=placeholder
ENV VITE_KIMI_AUTH_URL=${VITE_KIMI_AUTH_URL}
ENV VITE_APP_ID=${VITE_APP_ID}

# Build: vite (frontend) + esbuild (server bundle)
RUN pnpm run build

# ─── Stage 2: Runtime ────────────────────────────────────────────
FROM node:20-slim AS runtime

# Install pnpm globally
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Install production deps from lockfile
COPY app/package.json app/pnpm-lock.yaml ./
ENV NODE_ENV=production
RUN pnpm install --prod --frozen-lockfile

# Copy drizzle-kit (and its deps) from the builder's node_modules
# drizzle-kit is a devDep we need only for migrations at startup
COPY --from=builder /build/node_modules/drizzle-kit ./node_modules/drizzle-kit
COPY --from=builder /build/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --from=builder /build/node_modules/.bin/drizzle-kit ./node_modules/.bin/drizzle-kit

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
CMD ["sh", "-c", "./node_modules/.bin/drizzle-kit migrate && node dist/boot.js"]