FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
COPY apps/platform-api/package.json apps/platform-api/
COPY apps/sale-web/package.json apps/sale-web/
COPY apps/worker/package.json apps/worker/
COPY packages/database/package.json packages/database/
COPY packages/brand/package.json packages/brand/
RUN npm ci
COPY . .
RUN npm run db:generate && npm run build

FROM build AS api
ENV NODE_ENV=production
RUN mkdir -p /data/media && chown -R node:node /data/media
USER node
EXPOSE 3000
CMD ["node", "apps/platform-api/dist/main.js"]

FROM build AS worker
ENV NODE_ENV=production
USER node
CMD ["node", "apps/worker/dist/main.js"]

FROM nginx:1.28-alpine AS web
COPY infra/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/sale-web/dist /usr/share/nginx/html
EXPOSE 80

FROM caddy:2.11.4-alpine AS web-production
COPY infra/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/sale-web/dist /srv
EXPOSE 80 443
