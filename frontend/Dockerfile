# ==========================================
# Stage 1: Build & Dependencies
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency definition
COPY package*.json ./

# Install dependencies (use npm ci if lockfile exists, else npm install)
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Copy source code
COPY . .

# Build args and environment
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

# Build production assets
RUN npm run build

# ==========================================
# Stage 2: Development (Optional local dev)
# ==========================================
FROM node:20-alpine AS development

WORKDIR /app

COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .

EXPOSE 5173
CMD ["npm", "run", "dev"]

# ==========================================
# Stage 3: Production Runner (Nginx)
# ==========================================
FROM nginx:alpine AS production

# Copy custom nginx configuration for SPA routing & caching
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled static assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
