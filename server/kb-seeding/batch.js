// ═══════════════════════════════════════════════════════════════════════════
// Claude Batch API client
// ═══════════════════════════════════════════════════════════════════════════
//
// Thin wrapper over Anthropic's Message Batches API. Used by KB seeding
// (extraction + cross-reference) for cost-efficient async processing —
// ~50% discount versus the synchronous Messages API, with a 24-hour SLA.
//
// API reference: https://docs.anthropic.com/en/api/creating-message-batches
//
// Lifecycle:
//   1. submitBatch(requests)   → returns batch_id
//   2. getBatchStatus(batchId) → poll until 'ended'
//   3. getBatchResults(batchId)→ retrieve per-request outcomes
//
// Individual requests within a batch may succeed, error, expire, or
// be canceled independently. The batch-level status ('ended') only
// indicates that processing is complete — callers must inspect each
// result's `type` field to determine per-request outcomes.

const ANTHROPIC_API_BASE = "https://api.anthropic.com/v1";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_REQUESTS_PER_BATCH = 100000;  // Anthropic hard limit

// ─── Headers ────────────────────────────────────────────────────────────────

// Read API key at call time so .env reloads work without restarting the
// process. Matches the pattern used by server/routes/testcases.js.
function getHeaders() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured on the server");
  }
  return {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
  };
}

// ─── Response parsing ───────────────────────────────────────────────────────

// Parse an Anthropic JSON response, throwing a descriptive error on
// non-2xx. Anthropic returns structured error bodies:
//   { type: "error", error: { type: "...", message: "..." } }
async function parseJsonResponse(response, contextLabel) {
  const text = await response.text();
  if (!response.ok) {
    let detail = text.slice(0, 500);
    try {
      const parsed = JSON.parse(text);
      detail = parsed.error?.message || parsed.error?.type || detail;
    } catch {
      // Keep raw text as detail
    }
    throw new Error(`${contextLabel} failed (HTTP ${response.status}): ${detail}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `${contextLabel}: invalid JSON response: ${text.slice(0, 200)}`
    );
  }
}

// ─── submitBatch ────────────────────────────────────────────────────────────

/**
 * Submit a batch of requests to the Claude Batch API.
 *
 * Each request must include:
 *   - custom_id: stable identifier the caller uses to match results back
 *                (unique within the batch)
 *   - params:    standard Messages API params (model, max_tokens, system,
 *                messages, tools, etc.)
 *
 * @param {Array<{custom_id: string, params: object}>} requests
 * @returns {Promise<string>} batch_id (e.g. "msgbatch_01HkoX...")
 */
async function submitBatch(requests) {
  if (!Array.isArray(requests) || requests.length === 0) {
    throw new Error("submitBatch requires a non-empty array of requests");
  }
  if (requests.length > MAX_REQUESTS_PER_BATCH) {
    throw new Error(
      `Batch size ${requests.length} exceeds Anthropic limit of ${MAX_REQUESTS_PER_BATCH}`
    );
  }

  // Validate custom_ids are present and unique — Anthropic rejects
  // duplicates, but failing here gives a clearer error.
  const seen = new Set();
  for (const req of requests) {
    if (!req.custom_id || typeof req.custom_id !== "string") {
      throw new Error("Every request must have a string custom_id");
    }
    if (seen.has(req.custom_id)) {
      throw new Error(`Duplicate custom_id in batch: ${req.custom_id}`);
    }
    seen.add(req.custom_id);
    if (!req.params || typeof req.params !== "object") {
      throw new Error(`Request ${req.custom_id} is missing params`);
    }
  }

  const response = await fetch(`${ANTHROPIC_API_BASE}/messages/batches`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ requests }),
  });

  const body = await parseJsonResponse(response, "Batch submit");
  if (!body.id) {
    throw new Error(
      `Batch submit returned no id: ${JSON.stringify(body).slice(0, 200)}`
    );
  }
  return body.id;
}

// ─── getBatchStatus ─────────────────────────────────────────────────────────

/**
 * Check the processing status of a batch.
 *
 * Returns one of:
 *   - 'in_progress' : batch is still processing
 *   - 'canceling'   : cancellation requested, awaiting in-flight completion
 *   - 'ended'       : batch is complete (results available)
 *
 * Note: 'ended' means batch processing finished — individual requests
 * may have succeeded, errored, expired, or been canceled. Inspect
 * per-request results via getBatchResults() to determine outcomes.
 *
 * @param {string} batchId
 * @returns {Promise<'in_progress' | 'canceling' | 'ended'>}
 */
async function getBatchStatus(batchId) {
  if (!batchId) throw new Error("getBatchStatus requires a batchId");

  const response = await fetch(
    `${ANTHROPIC_API_BASE}/messages/batches/${batchId}`,
    { method: "GET", headers: getHeaders() }
  );

  const body = await parseJsonResponse(response, `Batch status (${batchId})`);
  return body.processing_status;
}

// ─── getBatchMetadata ───────────────────────────────────────────────────────

/**
 * Fetch the full batch metadata, including request_counts for progress
 * tracking. Useful for surfacing progress in the wizard UI:
 *   { processing: 23, succeeded: 17, errored: 0, canceled: 0, expired: 0 }
 *
 * @param {string} batchId
 * @returns {Promise<{
 *   id: string,
 *   processing_status: string,
 *   request_counts: object,
 *   created_at: string,
 *   ended_at: string|null,
 *   expires_at: string,
 *   results_url: string|null
 * }>}
 */
async function getBatchMetadata(batchId) {
  if (!batchId) throw new Error("getBatchMetadata requires a batchId");

  const response = await fetch(
    `${ANTHROPIC_API_BASE}/messages/batches/${batchId}`,
    { method: "GET", headers: getHeaders() }
  );

  return parseJsonResponse(response, `Batch metadata (${batchId})`);
}

// ─── getBatchResults ────────────────────────────────────────────────────────

/**
 * Retrieve and parse the results of a completed batch.
 *
 * Anthropic returns JSONL (one JSON object per line). Each line:
 *   { custom_id, result: { type, message?, error? } }
 *
 * result.type is one of:
 *   - 'succeeded' : message field contains the full API response
 *                   (with content blocks and usage info)
 *   - 'errored'   : error field contains failure details
 *   - 'canceled'  : request was canceled before processing
 *   - 'expired'   : request didn't process within the 24h window
 *
 * Only call after getBatchStatus returns 'ended'. Calling earlier
 * throws — Anthropic populates results_url only on completion.
 *
 * Malformed JSONL lines are skipped with a warning rather than
 * failing the whole retrieval — one bad line shouldn't lose results
 * for the other requests.
 *
 * @param {string} batchId
 * @returns {Promise<Array<{custom_id: string, result: object}>>}
 */
async function getBatchResults(batchId) {
  if (!batchId) throw new Error("getBatchResults requires a batchId");

  // Fetch batch metadata to get the results_url
  const meta = await getBatchMetadata(batchId);

  if (meta.processing_status !== "ended") {
    throw new Error(
      `Batch ${batchId} is not ended (current status: ${meta.processing_status})`
    );
  }
  if (!meta.results_url) {
    throw new Error(
      `Batch ${batchId} ended but has no results_url — cannot retrieve results`
    );
  }

  // Fetch the JSONL results body
  const resultsResponse = await fetch(meta.results_url, {
    method: "GET",
    headers: getHeaders(),
  });

  if (!resultsResponse.ok) {
    const text = await resultsResponse.text();
    throw new Error(
      `Results fetch failed (HTTP ${resultsResponse.status}): ${text.slice(0, 200)}`
    );
  }

  const text = await resultsResponse.text();
  const lines = text.split("\n").filter(line => line.trim().length > 0);

  const results = [];
  let malformed = 0;
  for (const line of lines) {
    try {
      results.push(JSON.parse(line));
    } catch (err) {
      malformed++;
      console.error(
        `Batch ${batchId}: failed to parse result line: ${line.slice(0, 200)}`
      );
    }
  }
  if (malformed > 0) {
    console.warn(
      `Batch ${batchId}: ${malformed} of ${lines.length} result lines were malformed and skipped`
    );
  }
  return results;
}

// ─── cancelBatch ────────────────────────────────────────────────────────────

/**
 * Cancel a batch in progress. Cancellation is best-effort — requests
 * already being processed may still complete. Idempotent: canceling
 * an already-canceled or already-ended batch returns success.
 *
 * Not currently called from any route — included for completeness
 * and as a primitive for future admin tooling.
 *
 * @param {string} batchId
 * @returns {Promise<void>}
 */
async function cancelBatch(batchId) {
  if (!batchId) throw new Error("cancelBatch requires a batchId");

  const response = await fetch(
    `${ANTHROPIC_API_BASE}/messages/batches/${batchId}/cancel`,
    { method: "POST", headers: getHeaders() }
  );
  await parseJsonResponse(response, `Batch cancel (${batchId})`);
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  submitBatch,
  getBatchStatus,
  getBatchMetadata,
  getBatchResults,
  cancelBatch,
};
