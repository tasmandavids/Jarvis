# syntax=docker/dockerfile:1.6
FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/ ./apps/
COPY packages/ ./packages/

RUN npm ci
RUN npm run build --workspace=@jarvis/web

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3005
# Turbopack's standalone build rewrites __dirname to a literal "/ROOT"
# placeholder, so @jarvis/config can't resolve its data dir on its own —
# point it at the copy we bundle alongside the server (same trick used by
# the Electron packaging in apps/desktop/main.js).
ENV CYPHER_DATA_ROOT=/app/packages/config/data

# `output: "standalone"` already traces the workspace deps + config data
# into apps/web/.next/standalone — it just excludes static assets and
# public/, which Next expects the deploy step to copy in manually.
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3005
CMD ["node", "apps/web/server.js"]