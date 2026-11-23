FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY src/ ./src/
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
RUN mkdir -m 700 /app/private && chown node:node /app/private
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY server/ ./server/
ENV NODE_ENV=production BIND=0.0.0.0 PORT=3000 DB_PATH=/app/private/app.sqlite
USER node
EXPOSE 3000
CMD ["node", "server/index.js"]
