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
RUN corepack enable
WORKDIR /app

COPY package.json package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web/ ./

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production

CMD ["/bin/sh", "-lc", "cd apps/web && npm run start"]