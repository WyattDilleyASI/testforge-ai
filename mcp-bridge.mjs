#!/usr/bin/env node

// mcp-bridge.mjs v2
// ═══════════════════════════════════════════════════════════════════
// Stdio-to-SSE bridge for Claude Desktop → TestForge MCP server.
// Claude Desktop launches this as a local process and communicates
// via stdin/stdout (JSON-RPC). This script relays messages to the
// TestForge SSE endpoint over HTTP.
// ═══════════════════════════════════════════════════════════════════

const TESTFORGE_URL = process.env.TESTFORGE_URL || "http://localhost:3000";
const MCP_TOKEN = process.env.MCP_TOKEN;

if (!MCP_TOKEN) {
  process.stderr.write("ERROR: MCP_TOKEN environment variable is required.\n");
  process.exit(1);
}

const SSE_URL = `${TESTFORGE_URL}/mcp/sse`;
const MESSAGES_URL = `${TESTFORGE_URL}/mcp/messages`;

let sessionId = null;
let buffer = "";
let messageQueue = [];

// ─── SSE Connection ─────────────────────────────────────────────────

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
    process.stderr.write(`SSE connection failed (${response.status}): ${text}\n`);
    process.exit(1);
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
      process.stderr.write("SSE connection closed by server.\n");
      process.exit(0);
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
        // Accumulate data lines (SSE spec: multi-line data)
        currentDataLines.push(line.slice(6));
      } else if (line === "") {
        // Empty line = end of event, dispatch it
        if (currentEventType && currentDataLines.length > 0) {
          const fullData = currentDataLines.join("\n");
          handleSSEEvent(currentEventType, fullData);
        }
        // Reset for next event
        currentEventType = null;
        currentDataLines = [];
      }
    }
  }
}

function handleSSEEvent(eventType, data) {
  if (eventType === "endpoint") {
    const match = data.match(/sessionId=([^&\s]+)/);
    if (match) {
      sessionId = match[1];
      process.stderr.write(`Session: ${sessionId}\n`);
      // Flush any queued messages
      flushQueue();
    }
  } else if (eventType === "message") {
    // Forward server→client JSON-RPC message to stdout
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

// ─── Start ──────────────────────────────────────────────────────────

connectSSE().catch((err) => {
  process.stderr.write(`Fatal: ${err.message}\n`);
  process.exit(1);
});