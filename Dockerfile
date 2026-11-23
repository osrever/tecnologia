FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi && npm ci
COPY index.html vite.config.js ./
COPY src/ ./src/
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
RUN mkdir -m 700 /app/private && chown node:node /app/private
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node package.json ./
COPY --chown=node:node server/ ./server/
ENV NODE_ENV=production BIND=0.0.0.0 PORT=3000 DB_PATH=/app/private/app.sqlite
USER node
EXPOSE 3000
CMD ["node", "server/index.js"]
