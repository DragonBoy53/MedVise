FROM postgres:17-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates nodejs npm \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

CMD ["sh", "-lc", "pg_dump --version && node workers/dbWorker.js"]
