
FROM node:20-bookworm-slim AS base

WORKDIR /usr/src/app

FROM base AS deps
COPY package*.json ./
RUN npm ci

FROM base AS build
WORKDIR /usr/src/app
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runner

ENV NODE_ENV=production

WORKDIR /usr/src/app

RUN apt-get update && apt-get install -y \
    libnss3 \
    libdbus-1-3 \
    libatk1.0-0 \
    libasound2 \
    libxrandr2 \
    libxkbcommon-dev \
    libxfixes3 \
    libxcomposite1 \
    libxdamage1 \
    libgbm-dev \
    libcups2 \
    libcairo2 \
    libpango-1.0-0 \
    libatk-bridge2.0-0 \
    fonts-noto \
    fonts-noto-cjk \
    fonts-noto-color-emoji \
  && rm -rf /var/lib/apt/lists/*


COPY --from=build /usr/src/app/.next ./.next
COPY --from=build /usr/src/app/public ./public
COPY --from=build /usr/src/app/package*.json ./
COPY --from=deps  /usr/src/app/node_modules ./node_modules

EXPOSE 3000

CMD ["npm", "start"]
