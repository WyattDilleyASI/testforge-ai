#!/usr/bin/env node

// mcp-bridge.mjs v3
// ═══════════════════════════════════════════════════════════════════
// Stdio-to-SSE bridge for Claude Desktop → TestForge MCP server.
// Claude Desktop launches this as a local process and communicates
// via stdin/stdout (JSON-RPC). This script relays messages to the
// TestForge SSE endpoint over HTTP.
//
// v3: Added reconnect-with-backoff to survive container rebuilds.
// ═══════════════════════════════════════════════════════════════════

const TESTFORGE_URL = process.env.TESTFORGE_URL || "http://localhost:3000";
const MCP_TOKEN = process.env.MCP_TOKEN;

// ─── Reconnection config ────────────────────────────────────────────
const MAX_RETRIES = 30;          // Total attempts before giving up
const INITIAL_DELAY_MS = 1000;   // Start at 1s
const MAX_DELAY_MS = 10000;      // Cap at 10s
const BACKOFF_FACTOR = 1.5;      // Exponential backoff multiplier

if (!MCP_TOKEN) {
  process.stderr.write("ERROR: MCP_TOKEN environment variable is required.\n");
  process.exit(1);
}

const SSE_URL = `${TESTFORGE_URL}/mcp/sse`;
const MESSAGES_URL = `${TESTFORGE_URL}/mcp/messages`;

let sessionId = null;
let buffer = "";
let messageQueue = [];

// ─── SSE Connection (single attempt) ────────────────────────────────

async function connectSSE() {
  process.stderr.write(`Connecting to ${SSE_URL}...\n`);

  const response = await fetch(SSE_URL, {
    headers: {
      "Authorization": `Bearer ${MCP_TOKEN}`,
      "Accept": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SSE connection failed (${response.status}): ${text}`);
  }

  process.stderr.write("SSE connected.\n");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let sseBuffer = "";

  // SSE event state
  let currentEventType = null;
  let currentDataLines = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      // Server closed the connection — throw so reconnect logic kicks in
      throw new Error("SSE connection closed by server");
    }

    sseBuffer += decoder.decode(value, { stream: true });

    // Process complete lines
    while (sseBuffer.includes("\n")) {
      const newlineIdx = sseBuffer.indexOf("\n");
      const line = sseBuffer.slice(0, newlineIdx).replace(/\r$/, "");
      sseBuffer = sseBuffer.slice(newlineIdx + 1);

      if (line.startsWith("event: ")) {
        currentEventType = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        currentDataLines.push(line.slice(6));
      } else if (line === "") {
        if (currentEventType && currentDataLines.length > 0) {
          const fullData = currentDataLines.join("\n");
          handleSSEEvent(currentEventType, fullData);
        }
        currentEventType = null;
        currentDataLines = [];
      }
    }
  }
}

// ─── Reconnection wrapper ───────────────────────────────────────────

async function connectWithRetry() {
  let retries = 0;
  let delay = INITIAL_DELAY_MS;

  while (true) {
    try {
      // Reset session state on each new connection
      sessionId = null;

      await connectSSE();

      // If connectSSE() returns cleanly (it shouldn't normally),
      // treat it as a disconnect and retry
    } catch (err) {
      retries++;
      process.stderr.write(
        `Connection lost: ${err.message} (attempt ${retries}/${MAX_RETRIES})\n`
      );

      if (retries >= MAX_RETRIES) {
        process.stderr.write("Max retries reached. Exiting.\n");
        process.exit(1);
      }

      process.stderr.write(`Reconnecting in ${Math.round(delay / 1000)}s...\n`);
      await new Promise((resolve) => setTimeout(resolve, delay));

      // Exponential backoff with cap
      delay = Math.min(delay * BACKOFF_FACTOR, MAX_DELAY_MS);
    }
  }
}

// ─── SSE event handler ──────────────────────────────────────────────

function handleSSEEvent(eventType, data) {
  if (eventType === "endpoint") {
    const match = data.match(/sessionId=([^&\s]+)/);
    if (match) {
      sessionId = match[1];
      process.stderr.write(`Session: ${sessionId}\n`);
      flushQueue();
    }
  } else if (eventType === "message") {
    process.stderr.write(`SSE→stdout: ${data.slice(0, 120)}...\n`);
    process.stdout.write(data + "\n");
  }
}

// ─── Message queue (for messages received before session ID) ────────

function flushQueue() {
  while (messageQueue.length > 0) {
    const msg = messageQueue.shift();
    forwardMessage(msg);
  }
}

// ─── Stdin handler (Claude → TestForge) ─────────────────────────────

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;

  while (buffer.includes("\n")) {
    const newlineIdx = buffer.indexOf("\n");
    const line = buffer.slice(0, newlineIdx).trim();
    buffer = buffer.slice(newlineIdx + 1);

    if (!line) continue;

    process.stderr.write(`stdin→POST: ${line.slice(0, 120)}...\n`);

    if (!sessionId) {
      process.stderr.write("Queuing message (waiting for session)...\n");
      messageQueue.push(line);
    } else {
      forwardMessage(line);
    }
  }
});

async function forwardMessage(jsonStr) {
  if (!sessionId) {
    process.stderr.write("No session ID, re-queuing...\n");
    messageQueue.push(jsonStr);
    return;
  }

  const url = `${MESSAGES_URL}?sessionId=${sessionId}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: jsonStr,
    });

    if (!response.ok) {
      const text = await response.text();
      process.stderr.write(`POST error (${response.status}): ${text}\n`);
    } else {
      process.stderr.write(`POST OK (${response.status})\n`);
    }
  } catch (err) {
    process.stderr.write(`POST failed: ${err.message}\n`);
  }
}

// ─── Handle process signals ─────────────────────────────────────────

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
process.stdin.on("end", () => {
  process.stderr.write("stdin closed, exiting.\n");
  process.exit(0);
});

// ─── Start (with reconnection) ──────────────────────────────────────

connectWithRetry().catch((err) => {
  process.stderr.write(`Fatal: ${err.message}\n`);
  process.exit(1);
});