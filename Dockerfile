# Build for the GSRP verification service (bot + web in one process).
FROM node:20-bookworm-slim

# better-sqlite3 needs build tools to compile its native addon.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

# Persist the SQLite database outside the image.
VOLUME ["/app/data"]

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "src/index.js"]
