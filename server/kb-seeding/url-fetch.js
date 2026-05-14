// ═══════════════════════════════════════════════════════════════════════════
// KB Seeding — URL fetching with SSRF protection
// ═══════════════════════════════════════════════════════════════════════════
//
// fetchUrlAsText(url) → { url, text, source_type: 'url', title }
//
// Security model:
//   1. http(s) only — no file://, data://, gopher://, etc.
//   2. Hostname resolved via DNS before connect; ALL resolved IPs must
//      be public. Loopback / private / link-local / IMDS IPs blocked.
//   3. Redirects followed manually; each hop re-validated against the
//      same SSRF guard. Blocks public-DNS → private-IP redirect tricks.
//   4. Response capped at MAX_RESPONSE_BYTES; aborted if exceeded.
//   5. Content-Type allowlist: text/html, text/plain, text/markdown.
//      Rejects PDFs, JSON, binary streams, etc.
//   6. 15s total timeout via AbortController.
//
// Known v1 limitation: a tiny TOCTOU window exists between DNS lookup
// and TCP connect (classic DNS rebinding). For a hardened version, swap
// the global resolver for a custom undici dispatcher that connects to
// the validated IP literal with the original Host header. Acceptable
// for v1 against an authenticated internal tool.

const dns = require("dns").promises;
const net = require("net");
const { htmlToText } = require("./parser");

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;  // 10 MB — matches upload cap
const FETCH_TIMEOUT_MS   = 15000;
const MAX_REDIRECTS      = 5;

const ALLOWED_CONTENT_TYPES = [
  "text/html",
  "text/plain",
  "text/markdown",
];

const USER_AGENT = "TestForge-KB-Seeder/1.0 (+internal QA tool)";

// Hostnames blocked by name as belt-and-suspenders, in addition to the
// DNS-based IP check below. Cloud metadata service hostnames resolve
// to link-local IPs and would be caught by the IP check too, but listing
// them by name short-circuits cleanly and makes errors more readable.
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
]);

// ─── SSRF guard ─────────────────────────────────────────────────────────────

// Returns true for IPv4 addresses in any non-public range.
function isPrivateIPv4(ip) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(p => Number.isNaN(p))) return true;
  const [a, b, c] = parts;

  if (a === 0) return true;                                  // 0.0.0.0/8
  if (a === 10) return true;                                 // 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true;         // 100.64.0.0/10 CGNAT
  if (a === 127) return true;                                // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true;                   // 169.254.0.0/16 link-local (Azure IMDS)
  if (a === 172 && b >= 16 && b <= 31) return true;          // 172.16.0.0/12
  if (a === 192 && b === 0 && c === 0) return true;          // 192.0.0.0/24 IETF
  if (a === 192 && b === 168) return true;                   // 192.168.0.0/16
  if (a === 198 && (b === 18 || b === 19)) return true;      // 198.18.0.0/15 benchmark
  if (a >= 224 && a <= 239) return true;                     // 224.0.0.0/4 multicast
  if (a >= 240) return true;                                 // 240.0.0.0/4 reserved

  return false;
}

// Returns true for IPv6 addresses in any non-public range.
function isPrivateIPv6(ip) {
  const lower = ip.toLowerCase();
  if (lower === "::1") return true;                          // loopback
  if (lower === "::") return true;                           // unspecified
  if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true;         // fc00::/7 unique local
  if (/^fe[89ab][0-9a-f]:/.test(lower)) return true;         // fe80::/10 link-local
  if (lower.startsWith("ff")) return true;                   // ff00::/8 multicast

  // IPv4-mapped (::ffff:1.2.3.4) — validate the embedded v4
  const v4Mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4Mapped) return isPrivateIPv4(v4Mapped[1]);

  return false;
}

// Throws if the hostname is reserved, or resolves to any private IP.
async function assertPublicHost(hostname) {
  // Literal IP — validate directly, no DNS
  const ipVersion = net.isIP(hostname);
  if (ipVersion === 4) {
    if (isPrivateIPv4(hostname)) {
      throw new Error(`Refusing to connect to private/reserved IP: ${hostname}`);
    }
    return;
  }
  if (ipVersion === 6) {
    if (isPrivateIPv6(hostname)) {
      throw new Error(`Refusing to connect to private/reserved IP: ${hostname}`);
    }
    return;
  }

  // Hostname name check
  const lowered = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(lowered) || lowered.endsWith(".localhost")) {
    throw new Error(`Refusing to connect to reserved hostname: ${hostname}`);
  }

  // DNS resolve — reject if ANY resolved IP is private
  let addrs;
  try {
    addrs = await dns.lookup(hostname, { all: true });
  } catch (err) {
    throw new Error(`DNS lookup failed for ${hostname}: ${err.message}`);
  }
  if (!addrs.length) {
    throw new Error(`DNS lookup returned no addresses for ${hostname}`);
  }
  for (const { address, family } of addrs) {
    if (family === 4 && isPrivateIPv4(address)) {
      throw new Error(
        `Refusing to connect to ${hostname} — resolves to private IP ${address}`
      );
    }
    if (family === 6 && isPrivateIPv6(address)) {
      throw new Error(
        `Refusing to connect to ${hostname} — resolves to private IP ${address}`
      );
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseUrlOrThrow(input) {
  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error(`Invalid URL: ${input}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Unsupported URL scheme: ${parsed.protocol}`);
  }
  return parsed;
}

function isAllowedContentType(header) {
  if (!header) return false;
  const type = header.split(";")[0].trim().toLowerCase();
  return ALLOWED_CONTENT_TYPES.includes(type);
}

function extractTitleFromHtml(html) {
  const match = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  if (!match) return null;
  return match[1].replace(/\s+/g, " ").trim() || null;
}

// Stream-read the response body, aborting if it exceeds maxBytes.
async function readBodyWithCap(response, maxBytes) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    // Fallback path — shouldn't trigger on Node 20+ but kept defensive
    const buf = Buffer.from(await response.arrayBuffer());
    if (buf.length > maxBytes) {
      throw new Error(`Response exceeded ${maxBytes}-byte cap`);
    }
    return buf.toString("utf8");
  }

  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch { /* ignore */ }
      throw new Error(`Response exceeded ${maxBytes}-byte cap`);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString("utf8");
}

// ─── fetchUrlAsText (exported) ──────────────────────────────────────────────

/**
 * Fetch a URL, extract text content, return a normalized record.
 *
 * @param {string} input — http(s) URL
 * @returns {Promise<{ url: string, text: string, source_type: 'url', title: string|null }>}
 * @throws Error on invalid URL, SSRF block, redirect loop, oversize
 *         response, disallowed content-type, network failure, or timeout.
 */
async function fetchUrlAsText(input) {
  let currentUrl = parseUrlOrThrow(input);
  let redirects = 0;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    while (true) {
      // Re-validate on every hop, including the initial URL
      await assertPublicHost(currentUrl.hostname);

      const res = await fetch(currentUrl.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": USER_AGENT,
          "Accept": "text/html,text/plain,text/markdown;q=0.9,*/*;q=0.5",
        },
      });

      // Manual redirect handling
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) {
          throw new Error(`Redirect ${res.status} with no Location header`);
        }
        redirects += 1;
        if (redirects > MAX_REDIRECTS) {
          throw new Error(`Too many redirects (>${MAX_REDIRECTS})`);
        }
        // Drain the redirect response body to free the socket
        try { await res.arrayBuffer(); } catch { /* ignore */ }

        currentUrl = new URL(location, currentUrl);
        if (currentUrl.protocol !== "http:" && currentUrl.protocol !== "https:") {
          throw new Error(`Redirect to unsupported scheme: ${currentUrl.protocol}`);
        }
        continue;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText || ""}`.trim());
      }

      const contentType = res.headers.get("content-type") || "";
      if (!isAllowedContentType(contentType)) {
        const bare = contentType.split(";")[0].trim() || "(none)";
        throw new Error(
          `Unsupported content-type "${bare}" — expected HTML, plain text, or markdown`
        );
      }

      const body = await readBodyWithCap(res, MAX_RESPONSE_BYTES);
      const isHtml = contentType.toLowerCase().includes("text/html");
      const text   = isHtml ? htmlToText(body) : body;
      const title  = isHtml ? extractTitleFromHtml(body) : null;

      return {
        url: currentUrl.toString(),
        text,
        source_type: "url",
        title,
      };
    }
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`Fetch timed out after ${FETCH_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  fetchUrlAsText,
  // Exposed for unit testing
  _internal: {
    isPrivateIPv4,
    isPrivateIPv6,
    assertPublicHost,
    parseUrlOrThrow,
    isAllowedContentType,
  },
};