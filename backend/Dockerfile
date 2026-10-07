# ==========================================
# Stage 1: Dependencies & Prisma Generation
# ==========================================
FROM node:20-alpine AS dependencies

RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies cleanly and generate Prisma client
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
RUN npx prisma generate

# ==========================================
# Stage 2: Application Builder
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json tsconfig*.json nest-cli.json ./
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/prisma ./prisma
COPY src ./src

# Compile NestJS typescript source
RUN npm run build

# Remove development dependencies to keep production footprint minimal
RUN npm prune --omit=dev

# ==========================================
# Stage 3: Development (Optional local dev)
# ==========================================
FROM node:20-alpine AS development

RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
RUN npx prisma generate

COPY . .

EXPOSE 3000
CMD ["npm", "run", "start:dev"]

# ==========================================
# Stage 4: Production Runner
# ==========================================
FROM node:20-alpine AS production

RUN apk add --no-cache openssl libc6-compat dumb-init

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy only production dependencies and built code
COPY --chown=node:node package*.json ./
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist

# Switch to non-root user
USER node

EXPOSE 3000

# Use dumb-init to properly handle signal forwarding (SIGTERM, SIGINT)
ENTRYPOINT ["dumb-init", "--"]

CMD ["sh", "-c", "npx prisma db push --skip-generate && (if [ -f dist/src/main.js ]; then node dist/src/main.js; else node dist/main.js; fi)"]
