# Flockcast: one Node process serving the API and the built web app, plus Python for the agents
# (stdlib only, so no pip install).
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends python3 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY engine ./engine
COPY agents/flockcast_agents ./agents/flockcast_agents
COPY src ./src
COPY public ./public
COPY docker-entrypoint.sh /usr/local/bin/

RUN mkdir -p data && chown node:node data

ENV NODE_ENV=production HOST=0.0.0.0 PORT=4180 REHEARSAL_DB=/app/data/rehearsal.db
EXPOSE 4180
VOLUME ["/app/data"]
# Starts as root only to hand a freshly mounted disk to the node user, then runs the app as node.
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "--no-warnings", "src/main.ts"]
