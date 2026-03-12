FROM node:20-alpine

WORKDIR /app

# Install server dependencies
COPY package.json package-lock.json* ./
RUN npm install --production

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
