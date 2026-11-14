# 1. Build React Client
FROM node:22-alpine AS client-build
WORKDIR /client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# 2. Build Server TypeScript
FROM node:22-alpine AS server-build
WORKDIR /app
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

# 3. Production Image
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY --from=server-build /app/dist ./dist
COPY --from=server-build /app/src/db/migrations ./dist/db/migrations
COPY --from=client-build /client/dist /client/dist
EXPOSE 4000
CMD ["node", "dist/index.js"]
