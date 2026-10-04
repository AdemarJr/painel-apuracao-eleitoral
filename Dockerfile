# Painel de Apuração Eleitoral — frontend + proxy TSE
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV TSE_MODE=oficial
ENV DIST_DIR=/app/dist
ENV CACHE_TTL_MS=10000
COPY package.json ./
COPY server ./server
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "server/proxy.mjs"]
