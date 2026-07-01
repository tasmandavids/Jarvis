# syntax=docker/dockerfile:1.6
FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /app

# Copy root manifests only
COPY package.json package-lock.json ./

# Install all workspace deps from root so local links resolve
RUN npm ci

# Build stage
FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /app

# Bring in the full workspace code plus cached node_modules
COPY package.json package-lock.json ./
COPY apps/ ./apps/
COPY packages/ ./packages/
COPY --from=deps /app/node_modules ./node_modules

# Build the web app
RUN npm run build --workspace=@jarvis/web

# Production runner
FROM node:22-alpine AS runner
RUN corepack enable && npm install -g serve@14
WORKDIR /app

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./.next/static
COPY --from=builder /app/apps/web/public ./public

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production

CMD ["node", "server.js"]
