FROM node:20-alpine AS deps
RUN corepack enable

# Check monorepo manifests
COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./
COPY apps/web/package.json apps/web/package-lock.json* apps/web/yarn.lock* apps/web/pnpm-lock.yaml* ./apps/web/
COPY packages/config/package.json packages/config/package-lock.json* packages/config/yarn.lock* packages/config/pnpm-lock.yaml* ./packages/config/

# Install workspace deps from root so links resolve
RUN npm install --include=dev

# Rebuild source code
FROM node:20-alpine AS builder
RUN corepack enable
COPY --from=deps /node_modules ./node_modules
COPY . .

RUN npm run build --workspace=@jarvis/web

# Production image
FROM node:20-alpine AS runner
RUN corepack enable && npm install -g serve@14

WORKDIR /app

COPY --from=builder /apps/web/public ./public
COPY --from=builder /apps/web/.next/standalone ./
COPY --from=builder /apps/web/.next/static ./.next/static

EXPOSE 3005
ENV PORT=3005
ENV NODE_ENV=production

CMD ["node", "server.js"]
