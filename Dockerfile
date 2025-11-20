ARG NODE_VERSION=22.15.0
FROM node:${NODE_VERSION}-alpine AS base

WORKDIR /usr/src/app

FROM base AS deps
COPY package*.json ./
RUN npm ci --only=production


FROM base AS build
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY . .
RUN npm run build


FROM base AS runner

ENV NODE_ENV=production

RUN addgroup -S nextjs && adduser -S nextjs -G nextjs
USER nextjs

WORKDIR /usr/src/app

COPY --from=build /usr/src/app/.next ./.next
COPY --from=build /usr/src/app/public ./public
COPY --from=build /usr/src/app/package*.json ./
COPY --from=deps /usr/src/app/node_modules ./node_modules

EXPOSE 3000

CMD ["npm", "start"]
