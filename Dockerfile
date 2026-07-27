# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies required for Prisma
RUN apk add --no-cache openssl

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci

# Generate Prisma Client
RUN npx prisma generate

# Copy application code
COPY . .

# Build the NestJS application
RUN npm run build

# Stage 2: Production
FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache openssl curl

# Set environment
ENV NODE_ENV=production

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install ONLY production dependencies
RUN npm ci --omit=dev

# Generate Prisma Client (needed in prod for runtime)
RUN npx prisma generate

# Copy compiled build from builder stage
COPY --from=builder /app/dist ./dist

# Expose backend port
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Start the application
CMD ["npm", "run", "start:prod"]
