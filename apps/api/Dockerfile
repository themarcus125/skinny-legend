FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @skinny/shared build && pnpm --filter @skinny/api build
RUN pnpm --filter @skinny/api --prod deploy --legacy /out

FROM node:22-alpine
WORKDIR /app
COPY --from=build /out .
# No drizzle/ or drizzle.config.ts here: drizzle-kit is a devDependency and is absent from
# the --prod image, so migrations are run from a dev checkout against the deployed database.
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.js"]
