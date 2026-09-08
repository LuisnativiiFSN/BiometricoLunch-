# syntax=docker/dockerfile:1

FROM node:24.18.1-bookworm-slim AS build
WORKDIR /src

RUN apt-get update && \
    apt-get install -y --no-install-recommends openssl && \
    rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.19.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile --filter @comedor/api...

COPY apps/api/ apps/api/
ENV DATABASE_URL="sqlserver://localhost:1433;database=build;user=build;password=BuildOnly123!;encrypt=true;trustServerCertificate=true"
RUN pnpm --filter @comedor/api prisma:generate && \
    pnpm --filter @comedor/api build && \
    pnpm --filter @comedor/api deploy --prod --legacy /out/api

FROM node:24.18.1-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app
RUN apt-get update && \
    apt-get install -y --no-install-recommends openssl && \
    rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /out/api/ ./

EXPOSE 3000
USER node
CMD ["node", "dist/main.js"]
