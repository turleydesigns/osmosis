FROM node:22-slim AS build

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
COPY packages/core/package.json packages/core/tsconfig.json ./packages/core/
COPY packages/mesh-server/package.json packages/mesh-server/tsconfig.json ./packages/mesh-server/
COPY packages/sync/package.json packages/sync/tsconfig.json ./packages/sync/
COPY packages/openclaw/package.json packages/openclaw/tsconfig.json ./packages/openclaw/
COPY packages/cli/package.json packages/cli/tsconfig.json ./packages/cli/

RUN npm ci

COPY packages/core/src ./packages/core/src
COPY packages/mesh-server/src ./packages/mesh-server/src
COPY packages/sync/src ./packages/sync/src
COPY packages/openclaw/src ./packages/openclaw/src
COPY packages/cli/src ./packages/cli/src

RUN npm run build

FROM node:22-slim

WORKDIR /app

COPY --from=build /app /app

EXPOSE 7433

CMD ["node", "packages/mesh-server/dist/entrypoint.js"]
