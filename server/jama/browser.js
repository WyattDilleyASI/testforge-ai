// ═══════════════════════════════════════════════════════════════════════════
// JamaSession — ephemeral browser lifecycle for one Jama interaction.
// ═══════════════════════════════════════════════════════════════════════════
//
// A JamaSession wraps a single Playwright browser context, used for either:
//   • a profile-creation discovery flow (sign in → list projects/filters →
//     dispose)
//   • a full import flow (sign in → run report → download → dispose)
//
// Sessions are NEVER persisted between requests. Each call creates a fresh
// browser context with no cookies and nothing on disk that survives
// dispose(). This implements the "re-auth every import" policy decision —
// credentials are accepted only for the duration of a single operation.
//
// Higher-level navigation steps (open a project, click a filter, click
// Export, wait for the report) live in navigate.js. This file only handles
// browser lifecycle + the login form.

const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");
const os = require("os");

const { LoginFailed, NavigationFailed } = require("./errors");

// Concurrency cap — wait for an available slot before launching Chromium.
// 3 matches the value we agreed on for MVP; bump in env if Azure can handle
// more without OOMing.
const MAX_CONCURRENT_SESSIONS = parseInt(
  process.env.JAMA_MAX_CONCURRENT_SESSIONS || "3",
  10
);

let activeSessions = 0;
const waitingForSlot = [];

function acquireSlot() {
  if (activeSessions < MAX_CONCURRENT_SESSIONS) {
    activeSessions++;
    return Promise.resolve();
  }
  return new Promise((resolve) => waitingForSlot.push(resolve));
}

function releaseSlot() {
  activeSessions = Math.max(0, activeSessions - 1);
  const next = waitingForSlot.shift();
  if (next) {
    activeSessions++;
    next();
  }
}

class JamaSession {
  constructor({ browser, context, page, baseUrl, downloadDir, onLog }) {
    this.browser = browser;
    this.context = context;
    this.page = page;
    this.baseUrl = baseUrl;
    this.downloadDir = downloadDir;
    this.onLog = onLog;
    this._disposed = false;
  }

  // Launch a fresh Chromium context and navigate to baseUrl.
  // Does NOT sign in — caller must call signIn() next.
  //
  // Acquires a concurrency slot before launching; releases on dispose().
  static async create({ baseUrl, onLog = noopLog }) {
    if (!baseUrl) {
      throw new Error("JamaSession.create: baseUrl is required");
    }

    await acquireSlot();

    const downloadDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "jama-import-")
    );

    let browser, context, page;
    try {
      onLog("info", "Launching Chromium...");
      // Debugging knobs: set JAMA_HEADED=1 to see the browser, JAMA_SLOWMO=300
      // to slow each action to ~300ms so a human can follow along. Both are
      // ignored in production unless set.
      const headed = process.env.JAMA_HEADED === "1";
      const slowMo = parseInt(process.env.JAMA_SLOWMO || "0", 10);
      browser = await chromium.launch({
        headless: !headed,
        ...(slowMo > 0 ? { slowMo } : {}),
      });

      context = await browser.newContext({ acceptDownloads: true });
      page = await context.newPage();

      onLog("info", `Opening ${baseUrl}...`);
      await page.goto(baseUrl, { timeout: 30_000, waitUntil: "domcontentloaded" });
    } catch (e) {
      // Roll back on any launch/nav failure: close browser, drop tmp dir,
      // release the slot we acquired.
      await safeClose(context, browser);
      await safeRm(downloadDir);
      releaseSlot();
      if (e instanceof NavigationFailed || e instanceof LoginFailed) throw e;
      throw new NavigationFailed(`Could not load Jama at ${baseUrl}: ${e.message}`);
    }

    return new JamaSession({ browser, context, page, baseUrl, downloadDir, onLog });
  }

  // Submit credentials on the Jama login form. Throws LoginFailed if Jama
  // rejects the credentials or the page never redirects away from /login.
  //
  // Selectors derived from a real Playwright codegen recording against
  // autonomoussolutions.jamacloud.com — the form uses accessible roles
  // for both fields and the submit button, so role-based locators are
  // both robust and tenant-portable.
  async signIn(username, password) {
    if (this._disposed) throw new Error("JamaSession.signIn: session disposed");
    if (!username || !password) {
      throw new LoginFailed("username and password are required");
    }
    this.onLog("info", "Submitting Jama credentials...");

    // Wrap the whole sign-in dance so any Playwright error (selector
    // miss, navigation timeout, network blip) gets credential-sanitized
    // before propagating. Playwright in general doesn't echo `fill()`
    // arguments into errors, but we don't want to rely on that —
    // sanitization is cheap and defensive.
    try {
      // baseUrl typically redirects to /login.req when unauthenticated,
      // but be explicit so signIn works even if a caller navigates
      // elsewhere first.
      if (!/\/login/i.test(this.page.url())) {
        await this.page.goto(`${this.baseUrl}/login.req`, {
          timeout: 30_000,
          waitUntil: "domcontentloaded",
        });
      }

      await this.page.getByRole("textbox", { name: "Username" }).fill(username);
      await this.page.getByRole("textbox", { name: "Password" }).fill(password);
      await this.page.getByRole("button", { name: "Sign in" }).click();

      // On success, Jama redirects out of /login. If we're still there
      // after 30s, either the credentials were bad or the network hung.
      await this.page.waitForURL((url) => !/\/login/i.test(url.toString()), {
        timeout: 30_000,
      });
    } catch (e) {
      // Distinguish bad-credentials from other failures (network, slow
      // server, etc.) so we can surface a clear message instead of
      // leaking Playwright's raw timeout text.
      const url = this.page.url();
      if (/\/login/i.test(url)) {
        // Still on the login page after 30s — credentials rejected.
        // Try to surface Jama's own error banner if it rendered one.
        let banner = "";
        try {
          const errLoc = this.page
            .getByText(/invalid|incorrect|wrong|denied|locked|disabled|failed/i)
            .first();
          if ((await errLoc.count()) > 0 && (await errLoc.isVisible())) {
            banner = ((await errLoc.textContent()) || "").trim();
          }
        } catch (_) {}
        if (banner) {
          throw new LoginFailed(`Jama rejected the sign-in: "${banner}"`);
        }
        throw new LoginFailed(
          "Jama did not accept the credentials. Double-check your username and password (case-sensitive)."
        );
      }
      // Some other navigation issue (e.g. network blip mid-redirect).
      throw new LoginFailed(sanitizeAuthError(e?.message, username, password));
    }
    this.onLog("info", "Signed in to Jama.");
  }

  // Tear down the browser context, delete the session's download dir, and
  // release the concurrency slot. Safe to call multiple times; idempotent.
  async dispose() {
    if (this._disposed) return;
    this._disposed = true;
    try {
      await safeClose(this.context, this.browser);
    } finally {
      await safeRm(this.downloadDir);
      releaseSlot();
    }
  }
}

// ── helpers ──────────────────────────────────────────────────────────────

function noopLog() {}

async function safeClose(context, browser) {
  try { if (context) await context.close(); } catch (_) {}
  try { if (browser) await browser.close(); } catch (_) {}
}

async function safeRm(dir) {
  if (!dir) return;
  try { await fs.promises.rm(dir, { recursive: true, force: true }); } catch (_) {}
}

// Defensive sanitizer for any error message that escapes the auth flow.
// Redacts the literal username + password so they can't leak into job
// rows, audit logs, or anything else that displays the error text.
//
// If the message is empty, returns a generic fallback so the user gets
// SOME signal that login failed (not an empty-string error).
function sanitizeAuthError(message, username, password) {
  if (!message) return "Sign in to Jama failed — check your username and password";
  let cleaned = String(message);
  if (password) {
    const re = new RegExp(escapeForRegex(password), "g");
    cleaned = cleaned.replace(re, "[redacted]");
  }
  if (username) {
    const re = new RegExp(escapeForRegex(username), "g");
    cleaned = cleaned.replace(re, "[redacted]");
  }
  return cleaned;
}

function escapeForRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
  JamaSession,
  MAX_CONCURRENT_SESSIONS,
};
