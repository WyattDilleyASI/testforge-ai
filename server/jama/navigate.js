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

// Name of the subtree to deep-scrape. Other top-level components are
// captured as roots-with-no-children placeholders so the tree retains
// project context without paying the full expansion cost.
//
// HARDCODED for MVP — this matches the V&V container in the ASI
// Landscaping project. To support other subtrees later, surface this
// as a profile-level field.
const SCRAPE_SUBTREE_NAME = "Verification & Validation";

const {
  NavigationFailed,
  ReportTimeout,
  ProfileNotFound,
  ExportFailed,
} = require("./errors");

// ─── Project tree scraping (for TC export destination picker) ────────────

/**
 * Walk the Jama project Explorer sidebar and return its full tree
 * (project root, Components, Sets, plus leaf items like Verification
 * Test Cases) as a nested JSON structure.
 *
 * Used to populate the destination picker when exporting test cases to
 * Jama — users navigate the cached tree to find the right "Verification
 * Test Cases" set to push TCs into. The same tree is also useful for
 * the requirement-import side, so we capture EVERYTHING (containers
 * AND leaves), not just containers.
 *
 * Implementation notes (derived from real DOM):
 *   - The tree is rendered as a VIRTUALIZED list — only ~30 visible rows
 *     at a time, despite the inner container being thousands of px tall.
 *     Walking the DOM at a single scroll position misses 90% of nodes.
 *     We must scroll through programmatically and accumulate.
 *   - Each row is a `<div role="treeitem">` with attributes:
 *       value="p-152" or "a-N"     — Jama internal item id
 *       data-key="String_..."      — unique key (used for deduping)
 *       aria-level="N"             — depth in the tree (root=1)
 *       title, aria-label          — node label
 *     and an inner `<img class="tree-node__icon-wrapper-icon">` whose
 *     `title` attribute names the type ("Project", "Component", "Set of
 *     Verification Test Cases", "Verification Test Case", etc.).
 *   - Hierarchy is implicit via aria-level, NOT via DOM nesting. We
 *     reconstruct the nested tree from the flat list by walking in
 *     visual order (sorted by row top position) and tracking depth.
 *   - Containers (Project, Component, Set, …) have `aria-expanded`;
 *     leaves don't. Toggle click target: `.rs-tree-node-toggle`.
 */
async function scrapeProjectTree(session, projectUrl) {
  const { page, onLog } = session;
  onLog("info", "Scraping project tree...");

  await openProject(session, projectUrl);

  // Wait for the tree to render at least one row.
  try {
    await page.locator('[role="treeitem"]').first().waitFor({ timeout: 30_000 });
  } catch (_) {
    throw new NavigationFailed("Project Explorer tree never rendered");
  }

  // Phase 1: expand all collapsed containers (handles virtualization).
  await expandAllTreeNodes(page, onLog);

  // Phase 2: scroll through and capture every visible row, deduping by
  // data-key. Returns a FLAT list of nodes with level info.
  const flat = await captureAllTreeRows(page, onLog);
  onLog("info", `Captured ${flat.length} tree node(s).`);

  // Phase 3: rebuild the nested tree from the flat list using aria-level.
  const tree = buildNestedTree(flat);
  if (!tree) {
    throw new NavigationFailed("Captured no tree nodes — Explorer was empty?");
  }

  return { tree, nodeCount: flat.length };
}

// Expand only the descendants of one named subtree (e.g. "Verification
// & Validation"). Scoping to a subtree dodges the "hours to expand the
// whole project" problem — we typically only care about V&V for TC
// export anyway. Other top-level components are left collapsed and
// will appear in the final tree as empty-children placeholders.
//
// Strategy:
//   1. Scroll through the virtualized tree to find the row whose
//      title matches SCRAPE_SUBTREE_NAME. Record its level + data-key.
//   2. If it's collapsed, expand it first.
//   3. Walk forward (by topPx) from that row. Every collapsed row we
//      encounter is a descendant *as long as* its aria-level is
//      strictly greater than the subtree root's level. The first row
//      we see at level <= root.level marks the end of the subtree.
//   4. Use Playwright clicks with force+noWaitAfter for speed (same
//      proven mechanism as before, just scoped).
async function expandAllTreeNodes(page, onLog) {
  // ── Phase 1: locate the target subtree by name ─────────────────
  onLog("info", `Looking for subtree "${SCRAPE_SUBTREE_NAME}"...`);
  await scrollTreeTo(page, 0);
  await page.waitForTimeout(150);

  let target = null;
  for (let scrollAttempts = 0; scrollAttempts < 200; scrollAttempts++) {
    const visible = await readVisibleRows(page);
    target = visible.find((r) => (r.name || "").trim() === SCRAPE_SUBTREE_NAME);
    if (target) break;
    const moved = await scrollTreeBy(page, 400);
    if (!moved) break;
    await page.waitForTimeout(120);
  }
  if (!target) {
    onLog("warn", `Subtree "${SCRAPE_SUBTREE_NAME}" not found — nothing to expand.`);
    return;
  }
  onLog("info", `Found "${SCRAPE_SUBTREE_NAME}" at level ${target.level}. Expanding descendants only...`);

  // ── Phase 2: ensure the subtree root is expanded ──────────────
  if (target.expandable && !target.expanded) {
    await clickExpandByKey(page, target.key);
    await page.waitForTimeout(300);
  }

  // ── Phase 3: walk forward from target, expand descendants only ─
  const expandedKeys = new Set();
  const failedKeys = new Set();
  let totalExpanded = 0;
  let totalFailed = 0;
  let pastSubtree = false;
  let safety = 0;

  // Scroll so the target row is near the top so we can sweep down.
  await scrollTreeTo(page, target.topPx);
  await page.waitForTimeout(150);

  while (!pastSubtree && safety++ < 5000) {
    const visible = (await readVisibleRows(page)).sort((a, b) => a.topPx - b.topPx);

    // Find the FIRST collapsed descendant of target visible right now.
    let nextToExpand = null;
    let sawTarget = false;
    for (const r of visible) {
      if (r.key === target.key) { sawTarget = true; continue; }
      // Skip rows above the target (could happen after scroll/reflow).
      if (!sawTarget && r.topPx < target.topPx) continue;
      // After target: a row at the same level or shallower means we've
      // left the subtree. We're done.
      if (r.topPx >= target.topPx && r.level <= target.level) {
        pastSubtree = true;
        break;
      }
      // Skip "Set of *" nodes — their children are individual items
      // (Verification Test Cases, etc.) which we filter out at capture
      // anyway. Skipping the expand saves time AND keeps the captured
      // tree clean.
      const isSetNode = (r.iconTitle || "").toLowerCase().startsWith("set of");
      // Strict descendant + collapsed + not yet tried + not a set.
      if (!isSetNode && r.level > target.level && r.expandable && !r.expanded &&
          !expandedKeys.has(r.key) && !failedKeys.has(r.key)) {
        nextToExpand = r;
        break;
      }
    }

    if (pastSubtree) break;

    if (!nextToExpand) {
      // Nothing actionable in current view — scroll down to bring more
      // descendants into the virtualized window.
      const moved = await scrollTreeBy(page, 400);
      if (!moved) break;
      await page.waitForTimeout(120);
      continue;
    }

    const ok = await clickExpandByKey(page, nextToExpand.key);
    if (ok) {
      expandedKeys.add(nextToExpand.key);
      totalExpanded++;
      if (totalExpanded % 10 === 0) {
        onLog("info", `Expanded ${totalExpanded} descendant(s) of "${SCRAPE_SUBTREE_NAME}"...`);
      }
    } else {
      failedKeys.add(nextToExpand.key);
      totalFailed++;
    }
    // Brief wait so Jama's lazy-load can render children before the
    // next visible-rows query.
    await page.waitForTimeout(150);
  }

  if (totalFailed > 0) {
    onLog(
      "warn",
      `Finished expanding subtree: ${totalExpanded} succeeded, ${totalFailed} failed.`
    );
  } else {
    onLog("info", `Finished expanding subtree "${SCRAPE_SUBTREE_NAME}": ${totalExpanded} descendant(s).`);
  }
}

// Read currently-rendered tree rows with the metadata expansion + capture need.
async function readVisibleRows(page) {
  return await page.locator('[role="treeitem"]').evaluateAll((els) =>
    els.map((el) => {
      const iconImg = el.querySelector(".tree-node__icon-wrapper-icon");
      return {
        key: el.getAttribute("data-key") || "",
        value: el.getAttribute("value") || "",
        level: parseInt(el.getAttribute("aria-level") || "0", 10),
        name: el.getAttribute("title") || "",
        ariaLabel: el.getAttribute("aria-label") || "",
        iconTitle: iconImg ? (iconImg.getAttribute("title") || "") : "",
        expandable: el.hasAttribute("aria-expanded"),
        expanded: el.getAttribute("aria-expanded") === "true",
        topPx: parseFloat(el.style.top) || 0,
      };
    })
  );
}

// Click the expand toggle for the row with the given data-key. Uses the
// Playwright click-with-fast-options that we proved works for Jama's
// trusted-event-checking tree framework.
async function clickExpandByKey(page, key) {
  try {
    await page.locator(`[role="treeitem"][data-key="${cssEscape(key)}"]`).first()
      .locator('[data-automation="node-expander"]').first()
      .click({ force: true, noWaitAfter: true, timeout: 4_000 });
    return true;
  } catch (_) {
    return false;
  }
}

function cssEscape(s) {
  // Minimal CSS attribute-value escape — data-key values are
  // "String_p-152" / "String_a-N" so just guard against quotes.
  return String(s).replace(/(["\\])/g, "\\$1");
}

// Scroll through the virtualized list and accumulate every row's data.
// Deduplicates by data-key across multiple scroll positions.
async function captureAllTreeRows(page, onLog) {
  await scrollTreeTo(page, 0);
  await page.waitForTimeout(150);

  const seen = new Map();
  let lastScrollTop = -1;

  while (true) {
    const rows = await page.locator('[role="treeitem"]').evaluateAll((els) =>
      els.map((el) => {
        const iconImg = el.querySelector(".tree-node__icon-wrapper-icon");
        return {
          key: el.getAttribute("data-key") || "",
          value: el.getAttribute("value") || "",
          level: parseInt(el.getAttribute("aria-level") || "0", 10),
          name: el.getAttribute("title") || "",
          ariaLabel: el.getAttribute("aria-label") || "",
          iconTitle: iconImg ? (iconImg.getAttribute("title") || "") : "",
          expandable: el.hasAttribute("aria-expanded"),
          // Virtualized rows are absolutely positioned; `top` gives us
          // a deterministic visual ordering we can sort by later.
          topPx: parseFloat(el.style.top) || 0,
        };
      })
    );

    for (const r of rows) {
      if (!r.key) continue;
      // Keep only containers — folders/components/sets. Leaf items
      // (individual Verification Test Cases, Requirements, etc.) are
      // not destinations for the export picker, just data living
      // INSIDE destinations.
      const it = (r.iconTitle || "").toLowerCase();
      const isContainer = it === "project" || it === "component" || it.startsWith("set of");
      if (!isContainer) continue;
      if (!seen.has(r.key)) seen.set(r.key, r);
    }

    const currentTop = await getTreeScrollTop(page);
    if (currentTop === lastScrollTop) break; // can't scroll further
    lastScrollTop = currentTop;

    const moved = await scrollTreeBy(page, 400);
    if (!moved) break;
    await page.waitForTimeout(120);

    if (seen.size > 0 && seen.size % 100 === 0) {
      onLog("info", `Captured ${seen.size} so far...`);
    }
  }

  // Sort visually (by topPx). The flat list is then in tree-walk order.
  return Array.from(seen.values()).sort((a, b) => a.topPx - b.topPx);
}

// Rebuild a nested tree from the flat aria-level-tagged list. Walk in
// visual order, maintaining a stack of "current ancestors" — when level
// goes up, push; when it drops back, pop until we match.
function buildNestedTree(flat) {
  if (flat.length === 0) return null;

  const toNode = (r) => ({
    jama_id: r.value,
    name: r.name,
    aria_label: r.ariaLabel,
    icon_title: r.iconTitle,
    type: deriveType(r.iconTitle),
    level: r.level,
    expandable: r.expandable,
    children: [],
  });

  const root = toNode(flat[0]);
  const stack = [root]; // ancestors; stack[i].level === i+1

  for (let i = 1; i < flat.length; i++) {
    const node = toNode(flat[i]);
    // Pop until the top of the stack is a strict ancestor (level < node.level)
    while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
      stack.pop();
    }
    if (stack.length === 0) {
      // Shouldn't happen if the tree is well-formed (multiple roots).
      // Treat as a sibling of root.
      // (Could capture as a separate root if needed.)
      stack.push(node);
      continue;
    }
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }

  return root;
}

// Map the icon's `title` attribute to a normalized type bucket. The
// raw icon_title is preserved on each node for finer filtering in the UI.
function deriveType(iconTitle) {
  const t = (iconTitle || "").toLowerCase();
  if (t === "project") return "project";
  if (t === "component") return "component";
  if (t.startsWith("set of")) return "set";
  if (t) return "leaf";
  return "unknown";
}

// ─── Scroll helpers (work against Jama's virtualized tree container) ────

async function scrollTreeTo(page, top) {
  await page.evaluate((scrollTop) => {
    const anyItem = document.querySelector('[role="treeitem"]');
    if (!anyItem) return;
    let el = anyItem.parentElement;
    while (el) {
      if (el.scrollHeight > el.clientHeight) {
        el.scrollTop = scrollTop;
        return;
      }
      el = el.parentElement;
    }
  }, top);
}

async function scrollTreeBy(page, delta) {
  return await page.evaluate((d) => {
    const anyItem = document.querySelector('[role="treeitem"]');
    if (!anyItem) return false;
    let el = anyItem.parentElement;
    while (el) {
      if (el.scrollHeight > el.clientHeight) {
        const before = el.scrollTop;
        el.scrollTop = Math.min(el.scrollTop + d, el.scrollHeight);
        return el.scrollTop > before;
      }
      el = el.parentElement;
    }
    return false;
  }, delta);
}

async function getTreeScrollTop(page) {
  return await page.evaluate(() => {
    const anyItem = document.querySelector('[role="treeitem"]');
    if (!anyItem) return 0;
    let el = anyItem.parentElement;
    while (el) {
      if (el.scrollHeight > el.clientHeight) return el.scrollTop;
      el = el.parentElement;
    }
    return 0;
  });
}

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
  scrapeProjectTree,
  openProject,
  clickSidebarFilter,
  runExportReport,
  waitForReportInHistory,
  downloadReport,
};
