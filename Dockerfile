# Glampire OS API — Fly.io / Docker
# Runs Express creative factory (Grok/fal + ffmpeg compose). UI is separate (Vercel).

FROM node:22-bookworm-slim

# ffmpeg for story concat / title burn; fonts for drawtext fallbacks
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    fontconfig \
    fonts-dejavu-core \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY clients ./clients
COPY public ./public

# Runtime data (renders, tmp) — prefer a Fly volume mounted at /app/server/data
RUN mkdir -p /app/server/data/renders /app/server/data/tmp /app/server/data/hyperframes \
    && chown -R node:node /app

ENV NODE_ENV=production
ENV PORT=8080

USER node
EXPOSE 8080

# Fly/proxy health: process must listen on 0.0.0.0:$PORT
CMD ["node", "server/index.js"]
