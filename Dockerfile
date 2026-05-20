# Base image: Debian slim instead of Alpine because Playwright (used by
# the Jama browser-driven import) doesn't officially support Alpine's
# musl libc — Chromium needs glibc. The slim variant keeps the image
# size reasonable while giving us a glibc base.
FROM node:20-bookworm-slim

WORKDIR /app

# Install server dependencies
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Install Chromium + its system libraries for Playwright. `--with-deps`
# runs apt-get under the hood to pull libnss3, fonts, etc. Adds ~400MB
# to the image. Only chromium is installed (not firefox/webkit) since
# the Jama integration only needs Chromium.
RUN npx playwright install --with-deps chromium

# Install and build client
COPY client/package.json client/package-lock.json* ./client/
RUN cd client && npm install
COPY client/ ./client/
RUN cd client && npm run build

# Copy server code
COPY server/ ./server/

# Copy MCP bridge script
COPY mcp-bridge.mjs ./

# Create data directory
RUN mkdir -p /app/data

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "server/index.js"]
