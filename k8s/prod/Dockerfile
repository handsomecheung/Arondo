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

RUN apt-get update && apt-get install -y git curl bash && rm -rf /var/lib/apt/lists/*

RUN npm install -g diff2html-cli @google/gemini-cli @openai/codex @anthropic-ai/claude-code

RUN curl -fsSL https://antigravity.google/cli/install.sh | bash && \
    mv /root/.local/bin/agy /usr/local/bin/agy && \
    chmod +x /usr/local/bin/agy

USER node
ENV HOME=/home/node

COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/public ./public

EXPOSE 3250

CMD ["npm", "run", "start"]
