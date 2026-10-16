# syntax=docker/dockerfile:1
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Dev: esbuild watch + static server; compose syncs source in (see compose.yaml)
FROM deps AS dev
COPY . .
EXPOSE 8080
CMD ["sh", "-c", "npm run build -- --watch=forever & exec node scripts/server.mjs"]

FROM deps AS build
COPY . .
# build:prod writes the hashed-name index.html into dist/; it replaces the dev one here
RUN npm run build:prod && mv dist/index.html index.html

# API: Express + migrations, run straight from TypeScript (Node type stripping)
FROM node:24-alpine AS api
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src/server ./src/server
COPY src/game ./src/game
COPY db ./db
USER node
EXPOSE 3000
CMD ["node", "src/server/main.ts"]

# Prod (default target): only the files the page loads
FROM nginxinc/nginx-unprivileged:alpine AS prod
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/index.html /app/404.html /app/styles.css /app/favicon.ico /usr/share/nginx/html/
COPY --from=build /app/dist /usr/share/nginx/html/dist
COPY --from=build /app/photos /usr/share/nginx/html/photos
EXPOSE 8080
