# syntax=docker/dockerfile:1
# Spec §13.4 — Node.js LTS image; sweph is a native (node-gyp / N-API) module, so it is installed and
# built inside the same Linux image family it runs on.
#
# Runs `next start` with the full node_modules rather than `output: 'standalone'`: standalone output
# tracing has not been verified to copy sweph's native binary (prebuilds/ or build/Release), so we
# don't rely on it.

ARG NODE_VERSION=22

# ---- deps: install (and if needed compile) dependencies -------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
# Toolchain for node-gyp in case no prebuilt sweph binary matches this platform/arch.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# ---- build ------------------------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# src/data/places.zh-TW.json must exist (generate it beforehand with `npx tsx scripts/build-places.ts`).
RUN test -f src/data/places.zh-TW.json || (echo "Missing src/data/places.zh-TW.json — run scripts/build-places.ts first" && exit 1)
RUN npm run build

# ---- runtime ----------------------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json /app/next.config.ts ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
# Smoke-check that the native module loads before starting.
CMD ["sh", "-c", "node -e \"require('sweph')\" && exec node_modules/.bin/next start -p ${PORT} -H ${HOSTNAME}"]
