FROM node:22.23.2-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5 AS build
ARG MOSSVALE_REVISION
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY tsconfig.json vite.config.js index.html auth-callback.html wallet-login.html wallet-action.html account.html support.html privacy.html pet-preview.html professions-preview.html ./
COPY src ./src
COPY mobile/app-update.ts ./mobile/app-update.ts
COPY public ./public
COPY scripts/service-worker.js ./scripts/service-worker.js
COPY scripts/build-release.mjs ./scripts/build-release.mjs
COPY scripts/compress-assets.mjs ./scripts/compress-assets.mjs
COPY deploy/ovh/compose.yml deploy/ovh/Caddyfile deploy/ovh/backup.sh deploy/ovh/database-tools.sh ./deploy/ovh/
RUN MOSSVALE_REVISION="$MOSSVALE_REVISION" npm run build && npm prune --omit=dev

FROM node:22.23.2-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5
ARG MOSSVALE_REVISION
LABEL org.opencontainers.image.revision=$MOSSVALE_REVISION
ENV NODE_ENV=production HOST=0.0.0.0 PORT=2567 DATA_DIR=/app/.data
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist/release.json ./release.json
COPY --from=build /app/src ./src
COPY --from=build /app/mobile/app-update.ts ./mobile/app-update.ts
COPY --from=build /app/public/contracts ./public/contracts
COPY config/apple-pki ./config/apple-pki
COPY config/mobile-app-updates.json ./config/mobile-app-updates.json
COPY config/mobile-push.json ./config/mobile-push.json
COPY server.mjs ./
COPY scripts/open-gold-round.mjs ./scripts/open-gold-round.mjs
RUN mkdir /app/.data && chown node:node /app/.data
USER node
EXPOSE 2567
CMD ["node", "server.mjs"]
