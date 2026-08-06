# ── cumu Dockerfile ───────────────────────────────────────────────────────────
# Multi-stage build: deps → production image
# Usage:
#   docker build -t cumu .
#   docker run -p 3000:3000 --env-file .env \
#     -v /dein/musik/ordner:/music \
#     -v cumu_data:/app/data cumu
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: dependencies ─────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# ── Stage 2: production image ─────────────────────────────────────────────────
FROM node:20-alpine AS runner

# ffmpeg für Audio-Metadaten, tini für sauberes Signal-Handling, wget für HEALTHCHECK
RUN apk add --no-cache ffmpeg tini wget

WORKDIR /app

# Deps aus Stage 1
COPY --from=deps /app/node_modules ./node_modules

# App-Quellcode
COPY src ./src
COPY public ./public
COPY package.json ./

# Verzeichnisse anlegen
RUN mkdir -p /app/data /music

# Non-root user
RUN addgroup -S cumu && adduser -S cumu -G cumu && \
    chown -R cumu:cumu /app /music

USER cumu

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

VOLUME ["/app/data", "/music"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/auth/me || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
