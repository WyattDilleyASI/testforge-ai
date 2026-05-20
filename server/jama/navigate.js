// ═══════════════════════════════════════════════════════════════════════════
// Jama navigation steps
// ═══════════════════════════════════════════════════════════════════════════
//
// Plain functions that drive a signed-in JamaSession through the
// deterministic Jama UI flow. Two surfaces live here:
//
//   • Discovery (profile creation):
//       listProjects(session)
//       listFiltersForProject(session, projectId)
//
//   • Import:
//       openProject(session, projectId)
//       clickSidebarFilter(session, filterName)
//       runExportReport(session)            → ISO timestamp of submission
//       waitForReportInHistory(session, m)  → row locator when Complete
//       downloadReport(session, rowHandle)  → absolute path of downloaded file
//
// Selectors are derived from a Playwright codegen recording against
// autonomoussolutions.jamacloud.com. They use role+name locators where
// possible so they stay portable across Jama tenants without depending
// on internal class names.

const path = require("path");

const {
  NavigationFailed,
  ReportTimeout,
  ProfileNotFound,
  ExportFailed,
} = require("./errors");

// ─── Profile-create discovery (URL paste) ────────────────────────────────

/**
 * Given a Jama project URL (e.g. "https://.../perspective.req#/projects/152/dashboard/399"),
 * extract the project id, open the project, and scrape the project's
 * display name from the page title. Returns both for the frontend to
 * persist as a profile.
 *
 * The page-title scrape strips common Jama suffixes (" - Jama Connect",
 * " - Jama Software") and the leading "Project " prefix Jama sometimes
 * adds. If we can't extract anything useful, fall back to "Project N"
 * so the user can edit it manually before saving the profile.
 */
async function discoverProjectByUrl(session, projectUrl) {
  const { page, onLog } = session;
  if (!projectUrl) {
    throw new NavigationFailed("project_url is required");
  }
  const m = String(projectUrl).match(/\/projects\/(\d+)/);
  if (!m) {
    throw new NavigationFailed(
      "Invalid Jama project URL — expected something like 'https://<tenant>.jamacloud.com/perspective.req#/projects/<id>/...'"
    );
  }
  const projectId = parseInt(m[1], 10);

  await openProject(session, projectUrl);

  // Try multiple strategies to grab the project's human-readable name.
  // page.title() turned out to NOT update reliably on at least one tenant
  // — the SPA keeps "Jama Software" as document.title even after the
  // project has rendered. So we also check visible headings and likely
  // project-name DOM nodes.
  const projectLabel = await tryScrapeProjectLabel(page);

  if (projectLabel) {
    onLog("info", `Resolved project ${projectId} → "${projectLabel}"`);
  } else {
    onLog("warn", `Could not auto-detect project ${projectId}'s name — user will need to type it in the next step`);
  }
  return { project_id: projectId, project_label: projectLabel };
}

// Try several DOM sources to find the project label. Returns "" if all
// strategies fail, so the frontend can prompt the user to type it.
async function tryScrapeProjectLabel(page) {
  const cleanLabel = (s) => (s || "")
    .replace(/\s*[-|]\s*Jama.*/i, "")
    .replace(/^Project\s+/i, "")
    .trim();
  const isAppDefault = (s) => !s || /^Jama (Software|Connect)\s*$/i.test(s.trim());

  // Strategy 1: poll page.title() for up to 8s. Works on tenants that
  // do update document.title to the project name; quick on others.
  const start = Date.now();
  while (Date.now() - start < 8_000) {
    const t = await page.title().catch(() => "");
    if (!isAppDefault(t)) {
      const cleaned = cleanLabel(t);
      if (cleaned) return cleaned;
    }
    await page.waitForTimeout(500);
  }

  // Strategy 2: scan visible h1/h2/h3 elements. Project name is usually
  // a header at the top of the project view.
  try {
    const headings = await page.locator("h1, h2, h3").all();
    for (const h of headings) {
      try {
        if (await h.isVisible()) {
          const text = ((await h.textContent()) || "").trim();
          if (text && text.length < 120 && !isAppDefault(text)) {
            const cleaned = cleanLabel(text);
            if (cleaned) return cleaned;
          }
        }
      } catch (_) { /* try next */ }
    }
  } catch (_) {}

  // Strategy 3: project-name-ish DOM nodes by class hint.
  const classHints = [
    '[class*="project-name"]',
    '[class*="ProjectName"]',
    '[class*="project-title"]',
    '[class*="ProjectTitle"]',
    '[class*="project-header"]',
  ];
  for (const sel of classHints) {
    try {
      const el = page.locator(sel).first();
      if ((await el.count()) > 0 && (await el.isVisible())) {
        const text = ((await el.textContent()) || "").trim();
        const cleaned = cleanLabel(text);
        if (cleaned && !isAppDefault(cleaned)) return cleaned;
      }
    } catch (_) {}
  }

  return "";
}

// ─── Import flow ──────────────────────────────────────────────────────────

/**
 * Navigate to a Jama project by its full URL.
 *
 * IMPORTANT: Jama's SPA renders nothing for the bare `/perspective.req#/
 * projects/<id>` route — you need a specific dashboard suffix (e.g.
 * `/dashboard/399`) for the Filters sidebar to render. So profiles must
 * store the full URL the user originally pasted (with whatever dashboard
 * id their tenant uses), and this function uses it verbatim.
 *
 * Accepts either an absolute URL or a string that contains the SPA
 * fragment route. Throws ProfileNotFound if navigation fails.
 */
async function openProject(session, projectUrl) {
  const { page, onLog } = session;
  if (!projectUrl || typeof projectUrl !== "string") {
    throw new NavigationFailed("openProject: projectUrl is required");
  }

  onLog("info", `Opening ${projectUrl}...`);

  try {
    await page.goto(projectUrl, { timeout: 30_000, waitUntil: "domcontentloaded" });
    // Give the SPA a moment to fetch + render the project shell.
    // Used to wait for the "Filters" sidebar link here, but that wait
    // turned out to be too brittle. clickSidebarFilter has its own
    // auto-wait when it tries to click Filters.
    await page.waitForTimeout(2500);
  } catch (e) {
    throw new ProfileNotFound(`Could not open project at ${projectUrl}: ${e.message}`);
  }
}

/**
 * Click the named filter in the project sidebar. The filter name is
 * matched exactly (e.g. "*All Requirement Types"). Throws ProfileNotFound
 * if no matching filter exists.
 */
async function clickSidebarFilter(session, filterName) {
  const { page, onLog } = session;
  if (!filterName) throw new NavigationFailed("clickSidebarFilter: filterName required");

  onLog("info", `Clicking sidebar filter "${filterName}"...`);

  // Expand the Filters section (idempotent — already-expanded clicks are safe).
  // Use a timeout-bounded click so we wait up to 10s for the Filters
  // link itself to render in the sidebar.
  try {
    await page.getByRole("link", { name: "Filters" }).click({ timeout: 10_000 });
  } catch (e) {
    throw new ProfileNotFound(`Filters sidebar section did not render: ${e.message}`);
  }

  // Wait for the specific filter cell to appear before clicking. Earlier
  // we counted immediately and threw if it wasn't there — but the
  // filter list takes a beat to populate after expanding the section.
  const cell = page.getByRole("cell", { name: filterName, exact: true });
  try {
    await cell.first().waitFor({ state: "visible", timeout: 10_000 });
  } catch (_) {
    throw new ProfileNotFound(`Filter "${filterName}" not found in project sidebar`);
  }
  await cell.first().click();

  // Give the results pane a moment to render. We don't wait for a specific
  // selector here because the requirements list isn't strictly required —
  // the Export button is what we need next, and it's in the toolbar.
  await page.waitForTimeout(1000);
}

/**
 * Open the Export dialog, pick the "All Item Details" template + WORD
 * format, ensure Include Relationships + Include Tags are checked and
 * Email-me is unchecked, click Run.
 *
 * Watches for Jama's "Export failed" toast for 5s after clicking Run.
 * If it appears, throws ExportFailed so the orchestrator can decide
 * whether to retry. Otherwise returns the ISO timestamp captured at the
 * moment of clicking Run, used to disambiguate our report from older
 * runs when polling the Reports History page.
 */
async function runExportReport(session) {
  const { page, onLog } = session;
  onLog("info", "Opening Export dialog...");

  // Export is a dropdown — the visible Run-with-default option is in the
  // button itself; "View all export options" opens the full dialog where
  // we can pick a template and format.
  await page.getByRole("button", { name: "Export" }).click();
  await page.getByRole("menuitem", { name: "View all export options" }).click();

  // Pick the bookmarked "All Item Details" template.
  await page.getByRole("cell", { name: "All Item Details" }).click();

  // The format chooser populates after picking a template — give it a
  // moment to render before trying to click WORD.
  await page.waitForTimeout(1000);

  // Try to explicitly select WORD format. From the live tenant we saw
  // it pre-selected for "All Item Details", so this click is defensive
  // rather than required — if no matching element is found in 5s we
  // log a warning and rely on Jama's default selection.
  await tryClickWordFormat(page, onLog);

  // Ensure both parameter checkboxes are checked. .check() is idempotent
  // but wrap each in a short timeout in case the rendered DOM uses a
  // different label / role.
  await tryEnsureChecked(page, "Include Relationships:", true, onLog);
  await tryEnsureChecked(page, "Include Tags:", true, onLog);
  await tryEnsureChecked(page, /email me/i, false, onLog);

  const submittedAt = new Date().toISOString();
  onLog("info", "Clicking Run...");
  await page.getByRole("button", { name: "Run", exact: true }).click();

  // After Run, Jama signals one of three things:
  //   • Failure modal "Can't complete export" (most common in practice)
  //   • Queued toast "Your report is being generated"
  //   • Ready toast "Report generated ... accessed here"
  //
  // We race for whichever appears first. The apostrophe in "can't" can
  // render as a straight ' or a smart ' (U+2019), so `.?` matches both
  // as well as the apostrophe-less variant. Hidden template elements
  // matching the failure pattern are filtered out via visibility check
  // — Jama pre-renders the error text into a dormant DOM node.
  const failurePattern = /(export failed|can.?t complete export|cannot complete export|failed to export|export error|error.*export)/i;
  const successPattern = /(report.*generated|your report is being generated|your report has been generated)/i;

  const start = Date.now();
  let outcome = null;
  while (Date.now() - start < 8_000) {
    // Failure is checked with the OK-button co-requirement.
    const failureText = await findVisibleFailureText(page, failurePattern);
    if (failureText) { outcome = { kind: "failure", text: failureText }; break; }
    // Success toast doesn't have OK — use the plain visible-text helper.
    const successText = await findVisibleText(page, successPattern);
    if (successText) { outcome = { kind: "success", text: successText }; break; }
    await page.waitForTimeout(250);
  }

  if (outcome?.kind === "failure") {
    // Dismiss the modal so the retry starts from a clean state. The
    // page.reload() in the orchestrator would clear it anyway, but
    // explicit OK is more polite.
    try {
      const okBtn = page.getByRole("button", { name: /^ok$/i });
      if ((await okBtn.count()) > 0) await okBtn.first().click({ timeout: 2_000 });
    } catch (_) {}
    throw new ExportFailed(`Jama: "${outcome.text}"`);
  }

  if (outcome?.kind === "success") {
    onLog("info", `Jama: "${outcome.text}" — moving to Reports History.`);
  } else {
    // No signal in 8s — proceed optimistically. The reports-history
    // polling loop has its own failure detection, so a late failure
    // still gets caught.
    onLog("info", "No signal from Jama in 8s — moving to Reports History anyway.");
  }

  // Dismiss the export dialog. Jama keeps it open after Run; its modal
  // backdrop persists across navigation and intercepts clicks on the
  // Reports History rows underneath.
  await dismissExportDialog(page, onLog);

  return submittedAt;
}

// Best-effort dismissal of Jama's "All export options" dialog. Tries
// several strategies (Close button → X icon → Escape) since the dialog
// might use different markup across tenant versions.
async function dismissExportDialog(page, onLog) {
  // Strategy 1: footer Close button
  try {
    const closeBtn = page.getByRole("button", { name: /^close$/i });
    if ((await closeBtn.count()) > 0 && (await closeBtn.first().isVisible())) {
      await closeBtn.first().click({ timeout: 2_000 });
      await page.waitForTimeout(300);
      return;
    }
  } catch (_) {}
  // Strategy 2: header X icon
  try {
    const x = page.locator('[aria-label*="Close" i], [title*="Close" i]').first();
    if ((await x.count()) > 0 && (await x.isVisible())) {
      await x.click({ timeout: 2_000 });
      await page.waitForTimeout(300);
      return;
    }
  } catch (_) {}
  // Strategy 3: Escape
  try {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  } catch (_) {}
}

/**
 * Navigate to Reports History and poll for our submitted report to land
 * with a Complete status.
 *
 * Row matching: a row whose visible text contains BOTH
 *   • "All Item Details"
 *   • the expected context string (`Filter named X in the Y project`)
 * is uniquely our report — the list is sorted by Started DESC, so the
 * topmost match is the one we just submitted.
 *
 * Status detection from the same row's text:
 *   • contains "Complete"            → ready, return the row locator
 *   • contains "Fail"/"Error"/"Cancel" → throw ExportFailed
 *   • otherwise                       → still generating, refresh + retry
 *
 * Times out (throws ReportTimeout) after maxMs.
 */
async function waitForReportInHistory(session, matcher, maxMs = 60_000) {
  const { page, baseUrl, onLog } = session;

  // Build a lenient match for the Context column. Jama strips leading
  // `*` (system filter indicator) when rendering the filter name in the
  // Context column, so a saved profile with filter_name "*All
  // Requirement Types" needs to match a row that says "...named All
  // Requirement Types in the...". The regex makes the asterisk optional
  // and tolerates extra whitespace.
  const filterCore = matcher.filterName.replace(/^\*+\s*/, "");
  const contextPattern = new RegExp(
    `Filter named\\s+\\*?\\s*${escapeRegex(filterCore)}\\s+in the\\s+${escapeRegex(matcher.projectLabel)}\\s+project`,
    "i"
  );
  onLog("info", `Will match Context column against: ${contextPattern.source}`);

  // ── Phase 1: wait on the current (project) page for Jama's
  //    "Report has been generated" toast (the one with the "here" link).
  //    This is Jama's authoritative "report done" signal. Polling the
  //    Reports History for a status change is unreliable when the
  //    server has a queue — reports stay in "Still running" for minutes.
  //    Watching for the ready toast is event-driven and accurate.
  //
  //    A late failure modal can still pop up during this wait, in which
  //    case we throw ExportFailed so the orchestrator retries.
  const failurePattern = /(export failed|can.?t complete export|cannot complete export|failed to export|export error|error.*export)/i;
  const readyPattern = /(your report has been generated|has been generated)/i;
  const READY_WAIT_MS = 5 * 60_000;  // 5 minutes — generous, queue can stack up

  onLog("info", "Waiting for Jama's 'Report has been generated' signal...");
  const readyStart = Date.now();
  let sawReady = false;
  while (Date.now() - readyStart < READY_WAIT_MS) {
    const failure = await findVisibleFailureText(page, failurePattern);
    if (failure) {
      try {
        const okBtn = page.getByRole("button", { name: /^ok$/i });
        if ((await okBtn.count()) > 0) await okBtn.first().click({ timeout: 2_000 });
      } catch (_) {}
      throw new ExportFailed(`Jama (late): "${failure}"`);
    }
    const ready = await findVisibleText(page, readyPattern);
    if (ready) {
      onLog("info", `Jama: "${ready}" — report is ready.`);
      sawReady = true;
      break;
    }
    await page.waitForTimeout(2_000);
  }

  if (!sawReady) {
    onLog("warn", `Did not see Jama's ready-toast in ${Math.round(READY_WAIT_MS / 1000)}s — checking history anyway`);
  }

  // ── Phase 2: navigate to Reports History and locate our row. Since
  //    we just saw the ready toast, the row should already be Complete
  //    and at the top of the list. A shorter timeout is fine.
  onLog("info", "Navigating to Reports History...");
  await page.goto(`${baseUrl}/perspective.req#/reporthistory`, {
    timeout: 30_000,
    waitUntil: "domcontentloaded",
  });

  // Defense in depth — dismiss the export dialog again in case it
  // persisted across navigation. (Jama renders dialogs in a top-level
  // container that survives SPA route changes, per the failure
  // screenshot showing the dialog open ON the reports-history page.)
  await dismissExportDialog(page, onLog);

  // CRITICAL: wait for the Reports History page to actually finish
  // rendering before we start polling. The SPA can take a beat to tear
  // down the previous project page's DOM, and while it's transitioning
  // the page still has the old hidden modal templates (which our
  // failure-text check would false-positive on).
  //
  // Try multiple "we're really on the reports page" signals in order.
  try {
    await page.waitForFunction(
      () => /reporthistory/i.test(window.location.href),
      { timeout: 15_000 }
    );
  } catch (_) {}
  try {
    await page.getByText(/Reports history/i).first().waitFor({ timeout: 10_000 });
  } catch (_) {
    // Fallback — wait for any table
    await page.locator("table").first().waitFor({ timeout: 15_000 });
  }

  // failurePattern is already declared above for the Phase 1 wait —
  // reuse it for the polling-loop's late-failure check as well.

  const start = Date.now();
  let attempt = 0;

  while (Date.now() - start < maxMs) {
    attempt++;

    // Check for a late-appearing failure dialog/toast first. Jama renders
    // these on top of whatever page we're on, so they're visible from
    // the Reports History view too.
    //
    // IMPORTANT: only treat as a real failure when the matched element
    // is actually visible. Jama pre-renders the "Can't complete export"
    // text into a hidden template element that getByText matches
    // unconditionally — without a visibility filter we'd false-positive
    // on every run.
    const visibleFailureText = await findVisibleFailureText(page, failurePattern);
    if (visibleFailureText) {
      try {
        const okBtn = page.getByRole("button", { name: /^ok$/i });
        if ((await okBtn.count()) > 0) await okBtn.first().click({ timeout: 2_000 });
      } catch (_) {}
      throw new ExportFailed(`Jama (late): "${visibleFailureText}"`);
    }

    const row = page
      .locator("tr", { hasText: "All Item Details" })
      .filter({ hasText: contextPattern })
      .first();

    if ((await row.count()) > 0) {
      const rowText = (await row.textContent()) || "";

      if (/\bComplete\b/i.test(rowText)) {
        onLog("info", "Report ready.");
        return row;
      }
      if (/\b(Fail(?:ed)?|Error|Cancelled)\b/i.test(rowText)) {
        throw new ExportFailed(`Jama report generation failed`);
      }
      // Still in-progress — fall through to refresh + wait
      onLog("info", `Report still generating (attempt ${attempt})...`);
    } else {
      onLog("info", `Report not yet in history (attempt ${attempt})...`);
    }

    // The history list doesn't auto-refresh. Click the refresh icon if
    // present; otherwise fall back to a full reload.
    const refreshBtn = page.getByRole("button", { name: /refresh/i }).first();
    if ((await refreshBtn.count()) > 0) {
      await refreshBtn.click().catch(() => {});
    } else {
      await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
    }
    await page.waitForTimeout(1500);
  }

  throw new ReportTimeout(
    `Jama did not finish generating the report within ${Math.round(maxMs / 1000)}s`
  );
}

/**
 * Click the Download Report button on the matched row, capture the
 * browser download event, save the file into the session's per-import
 * temp directory, and return its absolute path.
 */
async function downloadReport(session, rowHandle) {
  const { page, context, downloadDir, onLog } = session;
  onLog("info", "Downloading report...");

  // Try several locators for the download button. The codegen recording
  // showed it as `getByRole('button', { name: 'Download Report' })`, but
  // in some rows / themes it might just be `name: 'Download'` or
  // expose a link role rather than a button.
  const candidates = [
    () => rowHandle.getByRole("button", { name: /^download report$/i }),
    () => rowHandle.getByRole("button", { name: /download/i }),
    () => rowHandle.getByRole("link", { name: /download/i }),
    () => rowHandle.locator('[aria-label*="Download" i], [title*="Download" i]'),
  ];
  let downloadBtn = null;
  for (const make of candidates) {
    const loc = make();
    try {
      if ((await loc.count()) > 0) { downloadBtn = loc.first(); break; }
    } catch (_) {}
  }
  if (!downloadBtn) {
    throw new NavigationFailed("Could not find a Download button in the report row");
  }

  // Listen at the BROWSER CONTEXT level (not the page level). The
  // download might fire on a popup window — Jama is known to open a
  // popup for some download flows — and context-level listeners catch
  // downloads from any page in the context. (Page-level listeners miss
  // popup downloads.)
  const ctx = context || page.context();
  const [download] = await Promise.all([
    ctx.waitForEvent("download", { timeout: 30_000 }),
    downloadBtn.click(),
  ]);

  const filename = download.suggestedFilename();
  const dest = path.join(downloadDir, filename);
  await download.saveAs(dest);
  onLog("info", `Saved ${filename} (${dest})`);
  return dest;
}

// Escape a string for safe inclusion in a regex pattern.
function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Find the text of the first ACTUALLY VISIBLE element matching `pattern`,
// or null. "Actually visible" is stricter than Playwright's isVisible():
// in addition to the standard CSS checks (not display:none, not
// visibility:hidden, opacity > 0, non-zero size), we also require:
//   • the element's bounding box is within the viewport
//   • the element (or one of its descendants) is the topmost at its
//     center point — i.e., not covered by another element
//
// The topmost-element check is what catches Jama's hidden modal
// templates: they render at non-zero size but sit underneath the
// real visible content (success toast, dashboard, etc.), so
// document.elementFromPoint at their center returns the OTHER element
// — not them. Playwright's isVisible() returns true for these.
//
// Runs entirely in the page via evaluate(), so DOM traversal is fast.
async function findVisibleText(page, pattern) {
  return await page.evaluate(({ src, flags }) => {
    const re = new RegExp(src, flags);
    function isVisible(el) {
      if (!el || el.nodeType !== 1) return false;
      let cur = el;
      while (cur && cur !== document.body) {
        const s = window.getComputedStyle(cur);
        if (s.display === "none" || s.visibility === "hidden") return false;
        if (parseFloat(s.opacity) === 0) return false;
        cur = cur.parentElement;
      }
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return false;
      const top = document.elementFromPoint(cx, cy);
      if (!top) return false;
      return el === top || el.contains(top) || top.contains(el);
    }
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      const text = (n.textContent || "").trim();
      if (!text) continue;
      if (!re.test(text)) continue;
      if (isVisible(n.parentElement)) {
        return text;
      }
    }
    return null;
  }, { src: pattern.source, flags: pattern.flags }).catch(() => null);
}

// Backwards-compat alias — was previously distinguishing failure vs.
// generic visibility via the OK-button check, but the new findVisibleText
// is rigorous enough that the OK-button discriminator is no longer needed.
async function findVisibleFailureText(page, pattern) {
  return await findVisibleText(page, pattern);
}

// ─── Defensive click helpers ──────────────────────────────────────────────

// Click the WORD format option in Jama's export dialog. From the live
// DOM, the format chooser uses markup like:
//   <a><img class="j-report-format-icon" src="img/img_word_on.gif" alt=""><span>WORD</span></a>
// so the most reliable selector targets the icon image's src directly,
// which won't drift even if the surrounding markup changes.
//
// Why this matters: the format chooser has NO default selection — until
// the user clicks WORD, Jama refuses to run the export ("Export failed"
// toast). Failing to click WORD here is the root cause of the
// retry-with-reload firing on every run.
async function tryClickWordFormat(page, onLog) {
  const candidates = [
    // Most specific: the <a> wrapping the Word-icon image.
    () => page.locator('a:has(img.j-report-format-icon[src*="word"]), a:has(img[src*="img_word"])'),
    // The image itself (clicking it bubbles to the parent <a>).
    () => page.locator('img.j-report-format-icon[src*="word"]'),
    // Fallback: any element with role=link whose accessible name contains "WORD".
    () => page.getByRole("link", { name: /word/i }),
    () => page.getByRole("button", { name: /word/i }),
    () => page.getByText("WORD", { exact: true }),
  ];
  for (const make of candidates) {
    const loc = make();
    try {
      if ((await loc.count()) > 0) {
        await loc.first().click({ timeout: 5_000 });
        return;
      }
    } catch (_) {
      // try next strategy
    }
  }
  onLog(
    "warn",
    "Could not find a WORD-format selector — first export attempt is likely to fail with 'Export failed' since no format will be selected."
  );
}

// Ensure a checkbox (identified by label, exact or regex) is in the
// desired state. Tolerant of missing checkboxes — many of these are
// already in the right state by default; failing to find one isn't
// fatal, just logged.
async function tryEnsureChecked(page, label, shouldBeChecked, onLog) {
  try {
    const cb = page.getByRole("checkbox", { name: label });
    const count = await cb.count();
    if (count === 0) return; // not present — Jama may not show this option
    const isChecked = await cb.first().isChecked().catch(() => null);
    if (isChecked === shouldBeChecked) return;
    if (shouldBeChecked) {
      await cb.first().check({ timeout: 5_000 });
    } else {
      await cb.first().uncheck({ timeout: 5_000 });
    }
  } catch (e) {
    onLog(
      "warn",
      `Could not set checkbox "${label}" to ${shouldBeChecked ? "checked" : "unchecked"}: ${e.message}`
    );
  }
}

module.exports = {
  discoverProjectByUrl,
  openProject,
  clickSidebarFilter,
  runExportReport,
  waitForReportInHistory,
  downloadReport,
};
