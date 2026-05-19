// Phase 0 smoke test for Jama browser-driven import.
//
// Confirms Playwright can launch headless Chromium, render a page, and capture
// a screenshot in whatever environment this runs (local Windows dev, the
// Testforge Docker image, the Azure host running that image).
//
// Run locally:    npm run smoke:playwright
// Run in Docker:  docker run --rm testforge-smoke
//
// Exit 0 = Playwright works here. Exit 1 = something failed; full stack
// printed for diagnosis.

const { chromium } = require("playwright");
const fs = require("fs");
const os = require("os");
const path = require("path");

async function main() {
  const t0 = Date.now();
  console.log("[smoke] node version:", process.version);
  console.log("[smoke] platform:    ", process.platform, process.arch);

  console.log("[smoke] launching headless Chromium...");
  const browser = await chromium.launch({ headless: true });
  console.log("[smoke]   launched in", Date.now() - t0, "ms");

  const context = await browser.newContext();
  const page = await context.newPage();

  const url = "https://example.com";
  console.log("[smoke] navigating to", url);
  await page.goto(url, { timeout: 30_000 });

  const title = await page.title();
  console.log("[smoke] page title:", JSON.stringify(title));
  if (!title || !title.toLowerCase().includes("example")) {
    throw new Error(`unexpected title: ${title}`);
  }

  const outDir = process.env.SMOKE_OUTPUT_DIR || os.tmpdir();
  const outPath = path.join(outDir, "playwright-smoke.png");
  await page.screenshot({ path: outPath });
  const size = fs.statSync(outPath).size;
  console.log("[smoke] screenshot:", outPath, `(${size} bytes)`);

  await browser.close();
  console.log("[smoke] PASS — Playwright works here. total:", Date.now() - t0, "ms");
}

main().catch((e) => {
  console.error("[smoke] FAIL —", e.message);
  console.error(e.stack);
  process.exit(1);
});
