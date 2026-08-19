# ── Stage 1: build dependencies & app ──────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Install build tools required for native modules like better-sqlite3
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# ── Stage 2: production runtime image ─────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Install runtime tools required for audio processing (ffmpeg)
RUN apk add --no-cache ffmpeg tini wget

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Ensure data directory exists
RUN mkdir -p /app/data /music

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
