FROM node:20 AS builder
WORKDIR /app

COPY data/package*.json ./
RUN npm ci

COPY data/ ./
RUN npm run build

FROM node:20 AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3250
ENV HOSTNAME="0.0.0.0"

USER node
ENV HOME=/home/node

COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/server.ts ./server.ts
COPY --from=builder --chown=node:node /app/lib ./lib
COPY --from=builder --chown=node:node /app/next.config.ts ./next.config.ts
COPY --from=builder --chown=node:node /app/tsconfig.json ./tsconfig.json

EXPOSE 3250

CMD ["npm", "run", "start"]
