# Self-hosting image: `docker compose up -d` with compose.yaml; see "Run with Docker" in README.md.
FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim
# git: every workspace is a git repository, driven through the git CLI.
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY package.json ./
# scripts/ and src/lib/ back `npm run admin` (create-admin, reset-password).
COPY scripts ./scripts
COPY src/lib ./src/lib
RUN mkdir /data && chown node:node /data
USER node
ENV NODE_ENV=production INKMESH_DATA=/data PORT=3000 HOST=0.0.0.0
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/login').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "build"]
