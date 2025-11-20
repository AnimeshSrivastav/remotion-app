# Dockerfile

# 1) Base image
ARG NODE_VERSION=22.15.0
FROM node:${NODE_VERSION}-alpine AS base

WORKDIR /usr/src/app

# 2) Install dependencies (with dev deps) in a separate stage
FROM base AS deps
COPY package*.json ./
RUN npm ci

# 3) Build the Next.js app
FROM base AS build
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY . .
RUN npm run build

# 4) Production runtime image
FROM base AS runner

ENV NODE_ENV=production

# Non-root user (good practice)
RUN addgroup -S nextjs && adduser -S nextjs -G nextjs
USER nextjs

WORKDIR /usr/src/app

# Copy only what is needed to run
COPY --from=build /usr/src/app/.next ./.next
COPY --from=build /usr/src/app/public ./public
COPY --from=build /usr/src/app/package*.json ./
COPY --from=deps  /usr/src/app/node_modules ./node_modules

EXPOSE 3000

# For production, use "next start", not "next dev"
CMD ["npm", "start"]
