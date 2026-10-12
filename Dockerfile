# syntax=docker/dockerfile:1
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Dev: esbuild watch + static server; compose syncs source in (see compose.yaml)
FROM deps AS dev
COPY . .
EXPOSE 8080
CMD ["sh", "-c", "npm run build -- --watch=forever & exec node server.mjs"]

FROM deps AS build
COPY . .
RUN npm run build:prod

# Prod (default target): only the files the page loads
FROM nginxinc/nginx-unprivileged:alpine AS prod
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/index.html /app/404.html /app/styles.css /app/favicon.ico /usr/share/nginx/html/
COPY --from=build /app/dist /usr/share/nginx/html/dist
COPY --from=build /app/photos /usr/share/nginx/html/photos
EXPOSE 8080
