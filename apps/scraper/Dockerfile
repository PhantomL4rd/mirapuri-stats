# syntax=docker/dockerfile:1

# ============================================
# Base stage: Node + pnpm
# ============================================
FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# ============================================
# Dependencies stage: Install all deps
# ============================================
FROM base AS deps

# Copy workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy package.json files
COPY packages/shared/package.json ./packages/shared/
COPY apps/scraper/package.json ./apps/scraper/

# Install dependencies
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# ============================================
# Build stage: Bundle with esbuild
# ============================================
FROM deps AS build

# Copy source files
COPY packages/shared ./packages/shared
COPY apps/scraper ./apps/scraper
COPY tsconfig.base.json ./

# Build shared package and bundle crawler
RUN pnpm --filter @mirapri/shared build && \
    pnpm --filter @mirapri/scraper build:crawler

# ============================================
# Production stage: Minimal runtime
# ============================================
FROM base AS production

# Copy workspace config for prod deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/scraper/package.json ./apps/scraper/

# Install production dependencies only
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod

# Copy built files
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/apps/scraper/dist ./apps/scraper/dist

ENV NODE_ENV=production
WORKDIR /app/apps/scraper

# Run bundled JS directly (no tsx overhead)
ENTRYPOINT ["node", "dist/crawler-cli.bundle.mjs"]
CMD []
