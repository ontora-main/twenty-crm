FROM node:24-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY src ./src
RUN mkdir /data && chown node:node /data
USER node
WORKDIR /data
ENTRYPOINT ["node", "--experimental-strip-types", "/app/src/cli.ts"]
CMD ["--help"]
