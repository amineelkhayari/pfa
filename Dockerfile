# OpenWA - Dockerfile
# Multi-stage build for production-ready image

# ===== Stage 1: Builder =====
# Pin the builder to the BUILD host's platform (not the target's). It only produces arch-INDEPENDENT
# artifacts (the NestJS dist/ JS and the static dashboard SPA), so it never needs to run emulated for
# the non-native target. On a multi-arch buildx build this avoids QEMU emulating the whole npm ci +
# Vite build for arm64 — which is slow AND is where the arm64 lightningcss (Vite 8's native CSS
# minifier) optional dependency fails to install ("Cannot find module lightningcss.linux-arm64-gnu.node").
# The per-arch runtime deps are installed natively in the target-platform production stage below.
# NOTE: $BUILDPLATFORM requires BuildKit (CI uses buildx; modern `docker build`/compose default to it).
FROM --platform=$BUILDPLATFORM docker.io/node:25-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# The postinstall hook is a real file (scripts/postinstall.js), and `npm ci` fails outright when
# a lifecycle script is missing — copy it BEFORE the install. dashboard/ and the backport patcher
# are deliberately still absent at this point, so the hook cleanly no-ops here (dashboard deps are
# installed explicitly below; the patcher only matters for the production stage).
COPY scripts/postinstall.js ./scripts/

# Install all dependencies INCLUDING devDependencies — the build needs them (`nest` from
# @nestjs/cli, plus `vite`/`typescript` for the dashboard). `--include=dev` is REQUIRED, not
# cosmetic: npm omits devDependencies whenever NODE_ENV=production is present in the build env.
# Coolify (and similar PaaS) promote every ${VAR} referenced in the compose file to a build-time
# variable, so docker-compose.yml's `NODE_ENV=${NODE_ENV:-production}` leaks NODE_ENV=production
# into this stage and a bare `npm ci` would skip @nestjs/cli → `sh: 1: nest: not found` (exit 127).
# (docker-compose.dev.yml hardcodes NODE_ENV=development, which is why the dev build never hit this.)
RUN npm ci --include=dev

# Copy source code
COPY . .

# Build the API (dist/) and the dashboard SPA (dashboard/dist/). The root `npm ci` above
# ran before the dashboard source was copied, so its postinstall hook skipped the dashboard
# deps - install them explicitly here (npm ci, reproducible from dashboard/package-lock.json).
# `--include=dev` for the same reason as above: the dashboard build needs vite/typescript
# (devDependencies), which a NODE_ENV=production build env would otherwise omit.
# Drop the incremental-build cache afterwards: it is pinned inside dist/ (so nest's deleteOutDir
# wipes it with the output), and the production stage copies dist/ wholesale — it would otherwise
# ship dead compiler metadata in every image.
RUN npm run build && npm run dashboard:ci -- --include=dev && npm run dashboard:build && rm -f dist/*.tsbuildinfo

# ===== Stage 2: Production =====
FROM docker.io/node:25-slim AS production

# sqlite3 ships the CLI so an in-container scripts/backup.sh run takes online-consistent SQLite
# snapshots (.backup) instead of plain-copying a live database (which can archive a torn file).
RUN apt-get update && apt-get install -y --no-install-recommends \
    dumb-init \
    gosu \
    curl \
    procps \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# Create app user for security
RUN groupadd -r openwa && useradd -r -g openwa openwa

WORKDIR /app

# Copy package files
COPY package*.json ./

COPY scripts/postinstall.js ./scripts/

# Install production dependencies only.
RUN npm ci --omit=dev && npm cache clean --force

# Replace the npm the base image bundles. npm is not on the request path — the entrypoint runs
# `node dist/main` — but it stays in the image because the operator runbooks drive it
# (`docker exec openwa npm run cli …`, `npm run export`), and its own bundled dependency tree is
# what the release image scan reports. node:22-slim currently ships npm 10.9.8, whose bundle
# carries a critical node-tar advisory plus sigstore/picomatch ones; npm 12 fixes all three.
# Deliberately AFTER `npm ci`, so the application tree is still resolved by the npm the lockfile
# was generated with and only the global CLI is swapped.
RUN npm install -g npm@12 && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy the bundled dashboard SPA; ServeStaticModule serves it from this same process/port
# (app.module.ts resolves dashboard/dist relative to dist/). Single container, single port.
COPY --from=builder /app/dashboard/dist ./dashboard/dist

# Create data directories with correct ownership
RUN mkdir -p ./data/baileys ./data/media ./data/plugins && \
    chown -R openwa:openwa /app

ENV HOME=/app/data

# Copy entrypoint: runs as root to fix named-volume ownership, then drops to openwa via gosu
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Expose port
EXPOSE 2785

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:2785/api/health/ready || exit 1

# dumb-init is PID 1 and handles signal forwarding.
# It execs docker-entrypoint.sh (as root), which fixes volume ownership and
# then drops to the openwa user via gosu before starting the node process.
#
# NOTE — no `USER openwa` directive on purpose (Trivy DS-0002 will flag it, ignore).
# The Node process does NOT run as root: docker-entrypoint.sh:30 is
# `exec gosu openwa "$@"` after the chowns on lines 7 and 25. Adding `USER openwa`
# here would run the entrypoint as openwa and break the chown-before-drop pattern
# that makes named-volume mounts work on first boot (#254, #259).
ENTRYPOINT ["dumb-init", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/main"]
