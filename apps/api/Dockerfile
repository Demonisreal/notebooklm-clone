FROM node:24-slim AS build
WORKDIR /repo

RUN corepack enable pnpm

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter shared build && pnpm --filter api build

# das deploy-target zieht nur die produktiv-abhaengigkeiten in einen flachen baum
RUN pnpm --filter api deploy --prod --legacy /app

# workspace-pakete landen dabei als symlink auf die build-stage, die es spaeter nicht gibt
RUN rm -rf /app/node_modules/shared && \
	mkdir -p /app/node_modules/shared && \
	cp -r packages/shared/dist packages/shared/package.json /app/node_modules/shared/

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist

EXPOSE 3001
CMD ["node", "dist/main.js"]
