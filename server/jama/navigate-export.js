// ═══════════════════════════════════════════════════════════════════════════
// Jama test-case export — Playwright navigation
// ═══════════════════════════════════════════════════════════════════════════
//
// Counterpart to navigate.js, but for the *write* side: open the export
// profile's project, drive the Explorer sidebar down to the chosen Set
// node, and create or update test-case items inside it.
//
// Flow recorded from the Jama tenant (May 2026 walkthrough):
//   1. openProject(projectUrl) — same nav we use for imports
//   2. Walk down the Explorer tree expanding each ancestor of the
//      target Set (cached tree path comes from the orchestrator)
//   3. Right-click the Set row → Add → New item → "Verification Test Case"
//   4. New-item form loads at /items/new/{typeId};{projectId};{parentSetId}?tab=600
//      Required fields: NAME, DESCRIPTION (CKEditor), SETUP (CKEditor)
//      Optional: STEPS table (Action / Expected Result / Notes), AUTOMATED,
//      AUTOMATION TOOL, PRIORITY, etc.
//   5. Click "Save" (NOT "Save & done" — we need the form to stay open so
//      we can read the assigned PROJECT ID before closing)
//   6. Read PROJECT ID (e.g. "LFWM2-VERTC-1543") + GLOBAL ID ("GID-3644405")
//   7. Click "Done" to dismiss
//
// The CKEditor fields are filled by toggling Source mode and injecting
// our HTML directly — typing into the WYSIWYG would lose structure.

const { JamaError, NavigationFailed, UnexpectedPageState } = require("./errors");
const { openProject } = require("./navigate");

const NOT_IMPLEMENTED_CODE = "JAMA_EXPORT_NOT_IMPLEMENTED";

// Text we click in the right-click context menu. The "configured" item
// type for each Set under V&V in our tenant is "Verification Test Case"
// (marked with a checkmark icon in the submenu — see screenshot 6 of
// the walkthrough). If a future Set uses a different type, we'd need
// to learn it at runtime from the menu's iconography.
const ADD_TC_TYPE_LABEL = "Verification Test Case";

// ─── Public API ──────────────────────────────────────────────────────────

// Open the project, then expand the Explorer down to the target Set
// and select it. `pathToSet` is a list of jama_ids (e.g.
// ["p-152", "a-5096643", "a-...", "a-5101129"]) from root → target,
// inclusive at both ends. The orchestrator computes it from the cached
// tree before calling us.
async function navigateToSetNode(session, projectUrl, pathToSet, setName) {
  if (!Array.isArray(pathToSet) || pathToSet.length === 0) {
    throw new NavigationFailed("Empty path to destination Set — re-scrape the project tree.");
  }

  const page = session.page;
  const onLog = session.onLog || (() => {});
  await openProject(session, projectUrl);

  // Wait for the Explorer tree to actually finish loading. Jama
  // renders a placeholder treeitem with value="loading" first, then
  // swaps in real rows once the project loads — so we poll for the
  // project root specifically rather than just any treeitem.
  const rootId = pathToSet[0];
  const treeReady = await waitForTreeNode(page, rootId, 20_000);
  if (!treeReady) {
    throw new NavigationFailed(
      "Explorer tree didn't finish loading in time — Jama may be slow or the project may not exist."
    );
  }

  // Expand each ancestor in turn. We skip path[0] because that's the
  // project root, which Jama always renders pre-expanded in the
  // Explorer sidebar. We also skip the last entry — that's the
  // destination Set itself, which doesn't need its children expanded.
  for (let i = 1; i < pathToSet.length - 1; i++) {
    const ancestorId = pathToSet[i];
    const ok = await expandRowByValue(page, ancestorId, onLog);
    if (!ok) {
      throw new NavigationFailed(
        `Couldn't expand tree node ${ancestorId} on the way to ${setName}. ` +
        `The cached tree is probably stale — run "Refresh tree" and try again.`
      );
    }
    await page.waitForTimeout(180);
  }

  // Bring the target Set row into the visible window, then left-click
  // it so Jama selects it (some context-menu items only show up for the
  // currently-selected row).
  const targetId = pathToSet[pathToSet.length - 1];
  const targetRow = await scrollRowIntoView(page, targetId, onLog);
  if (!targetRow) {
    onLog("warn", `Path tried: ${pathToSet.join(" → ")}`);
    throw new NavigationFailed(
      `Couldn't find the destination Set ${setName} (${targetId}) in the Explorer tree ` +
      `after expanding its ancestors. Re-scrape the project tree.`
    );
  }
  // scrollRowIntoView now returns a state object with an attached
  // locator (when found). Pull the locator out for the click.
  await targetRow.row.click({ force: true, noWaitAfter: true, timeout: 4_000 });
  await page.waitForTimeout(200);
}

// Right-click the currently-selected Set, walk Import → Data Import
// Wizard, upload the XLSX, pick (or build + save) the field mapping,
// confirm, and read back how many items were created. Replaces the
// per-TC create flow which couldn't get past Jama's row-data binding
// for step cells.
//
// Args:
//   session       — JamaSession with .page + .onLog
//   setJamaId     — jama_id of the destination Set
//   xlsxPath      — local filesystem path of the XLSX to upload
//   mappingName   — name of the Jama saved field mapping. If present
//                   in the dropdown, we just pick it. If absent, we
//                   build the mapping manually + save it under this
//                   name (so subsequent runs find it ready).
//
// Returns { count } — number of items Jama reported it imported.
async function importTestCasesXlsx(session, setJamaId, xlsxPath, mappingName) {
  const page = session.page;
  const onLog = session.onLog || (() => {});

  const setRow = await scrollRowIntoView(page, setJamaId, onLog);
  if (!setRow) {
    throw new NavigationFailed(
      `Destination Set ${setJamaId} disappeared from the Explorer tree between selection and import.`
    );
  }

  const rowBox = await setRow.row.boundingBox();
  if (!rowBox) throw new NavigationFailed(`Couldn't get position of the destination Set row.`);
  const cx = rowBox.x + rowBox.width / 2;
  const cy = rowBox.y + rowBox.height / 2;

  // RE-SELECT the set with a left-click before right-clicking. Our
  // earlier scrollRowIntoView reset the tree scroll position, which
  // may have lost Jama's "currently selected set" state. The right-
  // click context menu shows Import either way, but Jama's import
  // wizard inherits the destination from the SELECTED set — not from
  // the right-clicked row alone. Without this re-select, the import
  // runs against a null destination and Jama throws
  // "Cannot read properties of null (reading 'createChild')".
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(600);

  const before = await snapshotVisibleLeaves(page);
  await page.mouse.move(cx, cy);
  await page.mouse.click(cx, cy, { button: "right" });
  await page.waitForTimeout(300);

  // Click the "Import" entry in the context menu.
  await clickContextMenuChain(page, onLog, before, ["Import"]);

  // ── Wait for the Data Import Wizard to render + tag its root ─────
  // The wizard renders as a modal overlay on top of the existing Jama
  // page. ALL subsequent DOM scans must be scoped to the wizard or
  // they'll hit background elements (e.g. an open column-toggle panel
  // from the TC library beneath the modal).
  await page.locator("text=Data Import Wizard").first()
    .waitFor({ state: "visible", timeout: 15_000 })
    .catch(() => { throw new UnexpectedPageState("Data Import Wizard didn't open."); });

  const WIZARD_ROOT_ID = "_pw_wizard_root";
  const wizardTagged = await page.evaluate((rootId) => {
    const isVisible = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      const cs = window.getComputedStyle(el);
      return cs.visibility !== "hidden" && cs.display !== "none";
    };
    // Find an element whose subtree contains ALL of these wizard
    // markers. The title bar alone isn't enough — we also need the
    // body (Field Mapping section) and the footer buttons. The
    // smallest such element is the modal's outer container.
    const required = ["Data Import Wizard", "Field Mapping", "Next", "Cancel"];
    let best = null;
    let bestSize = Infinity;
    for (const el of document.querySelectorAll("*")) {
      if (!isVisible(el)) continue;
      const text = el.textContent || "";
      if (required.every((s) => text.includes(s))) {
        // Smaller is better — we want the tightest container that
        // still includes everything wizard-related.
        if (text.length < bestSize) {
          best = el;
          bestSize = text.length;
        }
      }
    }
    if (!best) return { ok: false };
    const prior = document.getElementById(rootId);
    if (prior && prior !== best) prior.removeAttribute("id");
    best.id = rootId;
    return {
      ok: true,
      tag: best.tagName,
      cls: (best.className || "").toString().slice(0, 80),
      textLen: bestSize,
    };
  }, WIZARD_ROOT_ID);

  if (!wizardTagged.ok) {
    throw new UnexpectedPageState("Couldn't isolate the Data Import Wizard modal root.");
  }
  const wizard = page.locator(`#${WIZARD_ROOT_ID}`);
  onLog("info", `Data Import Wizard opened. Root: <${wizardTagged.tag}.${wizardTagged.cls}> (text=${wizardTagged.textLen}c)`);

  // Capture the full destination text the wizard is showing. If our
  // right-click didn't transfer the destination, this would say just
  // the project name; a proper destination shows the full path.
  const destText = await page.evaluate(() => {
    const root = document.getElementById("_pw_wizard_root");
    if (!root) return null;
    // Find the "Destination:" leaf, then the next sibling/follower
    // with the actual path text.
    const leaves = Array.from(root.querySelectorAll("*"))
      .filter((el) => el.children.length === 0)
      .filter((el) => /^Destination:?\s*$/i.test((el.textContent || "").trim()));
    if (leaves.length === 0) return "(no Destination label found)";
    const label = leaves[0];
    // Look at the next ~5 element siblings/cousins for the value.
    const nearby = [];
    let cur = label;
    for (let i = 0; i < 10 && cur; i++) {
      cur = cur.nextElementSibling || cur.parentElement?.nextElementSibling;
      if (!cur) break;
      const t = (cur.textContent || "").trim();
      if (t && t.length > 5 && !/^Destination/i.test(t)) {
        nearby.push(t.slice(0, 200));
        break;
      }
    }
    return nearby[0] || "(no destination value found)";
  });
  onLog("info", `Wizard destination: "${destText}"`);

  // ── Step 1 of 4 (or pre-step): Select Import File and Destination ─
  const fileInput = wizard.locator("input[type='file']").first();
  await fileInput.setInputFiles(xlsxPath);
  onLog("info", `Uploaded XLSX: ${xlsxPath} — waiting for Jama to scan it...`);

  // Jama parses the XLSX server-side after upload — this populates the
  // saved-mapping dropdown AND seeds the wizard's internal model with
  // column-mapping defaults. Advancing before this completes is what
  // causes the eventual `Cannot read properties of null (createChild)`
  // error: the import runs against a half-populated wizard state.
  //
  // We wait by watching for the "Browse..." button's adjacent text to
  // change from "No file selected" to the filename, which signals
  // upload completion, then a longer fixed delay for server-side
  // scanning. Real users see a loading spinner during this period.
  await waitForFileScanComplete(page, wizard, xlsxPath, onLog);

  const mappingPicked = await pickFieldMapping(page, wizard, mappingName, onLog);

  // After picking a saved mapping, Jama makes a server roundtrip to
  // apply the mapping to the scanned XLSX columns. The right-hand
  // field-mapping panel populates with Jama field labels (Name,
  // Description, Setup, Step Action, ...) once the apply completes.
  // Advancing the wizard before that point leaves the import in a
  // half-applied state and the eventual import fails with
  // "createChild on null" inside Jama's server-side processor.
  // The user's manual workflow is to wait for this panel to fill
  // before clicking Next — we mirror that here.
  if (mappingPicked) await waitForFieldMappingApplied(page, onLog);

  await clickWizardButton(wizard, "Next", onLog);
  await page.waitForTimeout(600);
  await waitForScanComplete(page, onLog);
  await dismissWarningIfPresent(wizard, onLog);

  if (!mappingPicked) {
    onLog("info", `No saved mapping "${mappingName}" found — building one from scratch.`);
    await fillFieldMappingStep(page, wizard, onLog);
    await clickWizardButton(wizard, "Next", onLog);
    await page.waitForTimeout(600);
    await waitForScanComplete(page, onLog);
    await dismissWarningIfPresent(wizard, onLog);
  } else {
    onLog("info", `Using saved mapping "${mappingName}".`);
  }

  // The wizard has 3 more advancement clicks after the first Next
  // (which we already did above to trigger the warning):
  //   Step 1 → 2: Next  (Choose Field Mappings → Additional Options)
  //   Step 2 → 3: Next  (Additional Options → Verify First Item)
  //   Step 3 → 4: Submit (Verify First Item → Final Import Summary, runs import)
  // Confirmed against a click recording of the manual workflow.
  // Warnings only appear once (the integer-warning on the first Next),
  // so subsequent transitions don't call dismissWarningIfPresent —
  // doing so risks misidentifying the progress modal as a warning.

  // ── Step 1 → 2 ──
  await clickWizardButton(wizard, "Next", onLog);
  await page.waitForTimeout(600);
  await waitForScanComplete(page, onLog);

  // ── Step 2 → 3 ──
  await clickWizardButton(wizard, "Next", onLog);
  await page.waitForTimeout(600);
  await waitForScanComplete(page, onLog);

  // ── Step 3 → 4: Submit triggers the import ──
  await clickWizardButton(wizard, "Submit", onLog);
  await page.waitForTimeout(1000);

  // ── Step 4 of 4: Final Import Summary ──
  // After Submit, Jama shows an "Import Items / Parsing Rows and
  // Creating Items / N of M" modal that runs for seconds-to-minutes
  // depending on payload size. readImportSummary polls through that
  // progress state until either "imported N items" (success) or
  // "Import Error" (failure) appears.
  const summary = await readImportSummary(page, onLog);
  if (!summary) {
    throw new UnexpectedPageState("Import wizard finished but didn't show a success or error message within 120s.");
  }
  if (summary.error) {
    throw new UnexpectedPageState(`Jama import failed: ${summary.error}`);
  }
  if (summary.count === 0) {
    throw new UnexpectedPageState("Import wizard reported 0 items imported.");
  }
  onLog("info", `Jama reported: imported ${summary.count} item(s).`);

  // If we built the mapping ourselves, save it for the next run.
  if (!mappingPicked) {
    const saveBtn = wizard.locator("button:has-text('Save This As New Document Mapping')").first();
    if (await saveBtn.count() > 0) {
      onLog("info", `Saving field mapping as "${mappingName}" for future runs...`);
      await saveBtn.click({ force: true });
      await page.waitForTimeout(400);
      await page.keyboard.type(mappingName, { delay: 5 });
      await page.keyboard.press("Enter");
      await page.waitForTimeout(400);
    }
  }

  await clickWizardButton(wizard, "Close", onLog).catch(() => { /* non-fatal */ });

  return { count: summary.count };
}

// ─── Wizard helpers ──────────────────────────────────────────────────────

// Wait for any visible Jama loading/scanning indicator to disappear.
// Used between every wizard transition since Jama runs server-side
// scans at multiple points (file upload, field-mapping commit, submit
// processing) — advancing while a scan is in progress leaves the
// wizard in a partially-loaded state and the eventual import fails
// with `createChild on null`.
async function waitForScanComplete(page, onLog, maxWaitMs = 60_000) {
  const deadline = Date.now() + maxWaitMs;
  let firstSawLoading = null;
  while (Date.now() < deadline) {
    const stillLoading = await page.evaluate(() => {
      const isVisible = (el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        const cs = window.getComputedStyle(el);
        return cs.visibility !== "hidden" && cs.display !== "none";
      };
      // ExtJS loading masks: x-mask, x-loading-mask, x-mask-loading,
      // x-mask-msg. Also check for explicit progress text.
      const masks = document.querySelectorAll(
        ".x-mask, .x-mask-loading, .x-loading-mask, .x-mask-msg, [class*='loading-mask']"
      );
      for (const m of masks) {
        if (isVisible(m)) return true;
      }
      // Scan for any short visible text that looks like a loading state.
      for (const el of document.querySelectorAll("*")) {
        if (el.children.length > 0) continue;
        const t = (el.textContent || "").trim();
        if (!t || t.length > 50) continue;
        if (!isVisible(el)) continue;
        if (/^(Loading|Scanning|Parsing|Processing|Please wait|Importing)\.{0,3}$/i.test(t)) {
          return true;
        }
      }
      return false;
    });
    if (!stillLoading) {
      if (firstSawLoading) {
        const elapsed = Date.now() - firstSawLoading;
        onLog("info", `Jama scan completed after ${elapsed}ms.`);
      }
      return;
    }
    if (!firstSawLoading) {
      firstSawLoading = Date.now();
      onLog("info", "Jama scan in progress, waiting...");
    }
    await page.waitForTimeout(250);
  }
  onLog("warn", `Jama scan didn't finish within ${maxWaitMs}ms — proceeding anyway.`);
}

// Poll until Jama finishes scanning the uploaded XLSX. We watch for
// two signals:
//   1. The filename appears in the wizard text (upload reached server)
//   2. Any visible "loading"/"scanning"/"processing" spinner is gone
// Then a fixed 1500ms grace period so server-side parsing finishes
// populating the field-mapping defaults. Without this wait, the
// wizard advances with a half-populated state and the import later
// fails with `createChild on null`.
async function waitForFileScanComplete(page, wizard, xlsxPath, onLog) {
  const filename = (xlsxPath || "").split(/[\\/]/).pop();
  const deadline = Date.now() + 30_000;

  // Phase 1: filename appears in the wizard
  while (Date.now() < deadline) {
    const ready = await page.evaluate((needle) => {
      const root = document.getElementById("_pw_wizard_root");
      if (!root) return false;
      return (root.textContent || "").includes(needle);
    }, filename);
    if (ready) break;
    await page.waitForTimeout(200);
  }
  onLog("info", `XLSX upload confirmed in wizard.`);

  // Phase 2: wait for any loading-state UI to disappear
  while (Date.now() < deadline) {
    const stillLoading = await page.evaluate(() => {
      const root = document.getElementById("_pw_wizard_root");
      if (!root) return false;
      const isVisible = (el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        const cs = window.getComputedStyle(el);
        return cs.visibility !== "hidden" && cs.display !== "none";
      };
      // ExtJS loading masks have classes like x-mask, x-loading-mask
      // x-mask-loading. Also check for explicit "Loading..." text.
      const masks = root.querySelectorAll(
        ".x-mask, .x-mask-loading, .x-loading-mask, .x-mask-msg, [class*='loading'], [class*='loader']"
      );
      for (const m of masks) {
        if (isVisible(m)) return true;
      }
      // Or any visible text containing "Loading" / "Scanning" / "Parsing".
      for (const el of root.querySelectorAll("*")) {
        if (el.children.length > 0) continue;
        const t = (el.textContent || "").trim();
        if (!t) continue;
        if (!isVisible(el)) continue;
        if (/^(Loading|Scanning|Parsing|Processing)\.{0,3}$/i.test(t)) return true;
      }
      return false;
    });
    if (!stillLoading) break;
    await page.waitForTimeout(250);
  }

  // Phase 3: fixed grace period so server-side mapping defaults settle.
  // Empirically, Jama needs a beat after the loading indicator
  // disappears before the wizard state is fully consistent.
  await page.waitForTimeout(1500);
  onLog("info", `XLSX scan period elapsed.`);
}

// Try to select the named saved field mapping. Jama renders the
// dropdown as a custom widget (not a native <select>), so we drive it
// by simulating a click on the widget, polling for the option text to
// appear, then clicking the option.
//
// The dropdown only populates AFTER the XLSX has been uploaded and
// parsed server-side. Caller should ensure that's happened before
// invoking this.
// After a saved mapping is picked, Jama applies it server-side and the
// right-hand field-mapping panel populates with the mapping rows. We
// can't reliably enumerate which label texts will be present (varies
// by project schema), so we use a content-stabilization signal: poll
// the wizard's text length until it stops changing for ~1.5 seconds.
// Also enforces a minimum 5 s wait (matches the user's manual "wait a
// few seconds" cue) and dumps a sample of the wizard's text on the
// first poll for diagnostics.
async function waitForFieldMappingApplied(page, onLog) {
  const MIN_WAIT_MS = 5_000;
  const MAX_WAIT_MS = 20_000;
  const STABLE_MS = 1_500;
  const startedAt = Date.now();
  const deadline = startedAt + MAX_WAIT_MS;
  let lastLength = -1;
  let lastChangeAt = startedAt;
  let dumpedSample = false;

  while (Date.now() < deadline) {
    const sample = await page.evaluate(() => {
      const wizardRoot = document.getElementById("_pw_wizard_root");
      if (!wizardRoot) return null;
      const text = (wizardRoot.textContent || "").replace(/\s+/g, " ").trim();
      return { length: text.length, head: text.slice(0, 250) };
    });
    if (!sample) {
      await page.waitForTimeout(300);
      continue;
    }

    if (!dumpedSample) {
      onLog("info", `Wizard text snapshot (first poll, len=${sample.length}): "${sample.head}..."`);
      dumpedSample = true;
    }

    if (sample.length !== lastLength) {
      lastLength = sample.length;
      lastChangeAt = Date.now();
    }
    const stableFor = Date.now() - lastChangeAt;
    const totalElapsed = Date.now() - startedAt;
    if (stableFor >= STABLE_MS && totalElapsed >= MIN_WAIT_MS) {
      onLog(
        "info",
        `Field-mapping ready: wizard text stable at len=${lastLength} for ${stableFor}ms (total wait ${totalElapsed}ms).`,
      );
      return;
    }
    await page.waitForTimeout(400);
  }
  onLog(
    "warn",
    `Field-mapping wait reached ${MAX_WAIT_MS}ms ceiling (final wizard text len=${lastLength}). Proceeding anyway.`,
  );
}

async function pickFieldMapping(page, wizard, mappingName, onLog) {
  // First: find the dropdown widget (the one labelled "Select a saved
  // field mapping:"). It contains placeholder text "Select a field
  // mapping..." when empty. Scoped to wizard.
  const dropdownInfo = await page.evaluate(({ mappingName }) => {
    const wizardRoot = document.getElementById("_pw_wizard_root");
    if (!wizardRoot) return { error: "no wizard root" };
    const isVisible = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      const cs = window.getComputedStyle(el);
      return cs.visibility !== "hidden" && cs.display !== "none";
    };
    // Find the label "Select a saved field mapping:" — the dropdown
    // widget is the visible interactive element just after it.
    const leaves = Array.from(wizardRoot.querySelectorAll("*"))
      .filter((el) => el.children.length === 0)
      .filter((el) => /Select a saved field mapping/i.test((el.textContent || "").trim()))
      .filter(isVisible);
    if (leaves.length === 0) return { error: "no 'Select a saved field mapping' label found" };
    const label = leaves[0];
    // Walk forward in DOM order to find the next interactive widget.
    // Could be a <button>, a <div role="button"|"combobox"|"listbox">,
    // a <select>, etc. We pick the first visible element with a
    // non-trivial role or tag of input-like type.
    const all = Array.from(wizardRoot.querySelectorAll("*"));
    let widget = null;
    for (const el of all) {
      if (!(label.compareDocumentPosition(el) & 4 /* FOLLOWING */)) continue;
      if (!isVisible(el)) continue;
      // Skip text leaves; we want an interactive widget.
      if (el.children.length === 0 && !["INPUT", "SELECT", "BUTTON"].includes(el.tagName)) continue;
      const role = el.getAttribute("role") || "";
      const tag = el.tagName;
      const text = (el.textContent || "").trim();
      // Pick the first element that looks like an interactive widget
      // AND whose text references a mapping concept (placeholder
      // "Select a field mapping..." or contains the mappingName).
      if (tag === "SELECT" || tag === "BUTTON" || tag === "INPUT" ||
          role === "combobox" || role === "listbox" || role === "button") {
        if (text.toLowerCase().includes("field mapping") ||
            text.toLowerCase().includes("select a field") ||
            text === "" || text.includes(mappingName)) {
          widget = el;
          break;
        }
      }
    }
    if (!widget) return { error: "no widget found after label" };
    widget.id = "_pw_mapping_dropdown";
    const r = widget.getBoundingClientRect();
    return {
      ok: true,
      tag: widget.tagName,
      role: widget.getAttribute("role") || "",
      cls: (widget.className || "").toString().slice(0, 60),
      text: (widget.textContent || "").trim().slice(0, 60),
      cx: r.left + r.width / 2,
      cy: r.top + r.height / 2,
    };
  }, { mappingName });

  if (dropdownInfo.error) {
    onLog("info", `Mapping dropdown lookup failed: ${dropdownInfo.error}.`);
    return false;
  }
  onLog("info", `Mapping dropdown widget: <${dropdownInfo.tag} role="${dropdownInfo.role}"> text="${dropdownInfo.text}"`);

  // Native <select> — use Playwright's selectOption directly.
  if (dropdownInfo.tag === "SELECT") {
    try {
      await page.locator("#_pw_mapping_dropdown").selectOption({ label: mappingName });
      return true;
    } catch (e) {
      onLog("info", `<select>.selectOption("${mappingName}") failed: ${e.message}.`);
      return false;
    }
  }

  // Custom widget — click to open, find the option, click it.
  await page.mouse.click(dropdownInfo.cx, dropdownInfo.cy);
  await page.waitForTimeout(400);

  // Find the option in the now-open dropdown panel.
  const optClicked = await page.evaluate(({ mappingName }) => {
    const isVisible = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      const cs = window.getComputedStyle(el);
      return cs.visibility !== "hidden" && cs.display !== "none";
    };
    // Option list typically lives outside the wizard's tagged root
    // (positioned at <body> level for z-index). Search the whole doc.
    const opts = Array.from(document.querySelectorAll("*"))
      .filter((el) => el.children.length === 0)
      .filter((el) => (el.textContent || "").trim() === mappingName)
      .filter(isVisible);
    if (opts.length === 0) {
      // Diagnostic: dump visible short leaves that might be options.
      const sample = Array.from(document.querySelectorAll("*"))
        .filter((el) => el.children.length === 0)
        .filter(isVisible)
        .map((el) => (el.textContent || "").trim())
        .filter((t) => t.length > 0 && t.length < 40)
        .slice(0, 30);
      return { ok: false, sample };
    }
    const opt = opts[0];
    const r = opt.getBoundingClientRect();
    return { ok: true, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  }, { mappingName });

  if (!optClicked.ok) {
    onLog("info", `Option "${mappingName}" not in opened dropdown. Visible: ${(optClicked.sample || []).join(" | ")}`);
    // Close the dropdown by clicking elsewhere.
    await page.keyboard.press("Escape").catch(() => {});
    return false;
  }
  await page.mouse.click(optClicked.cx, optClicked.cy);
  await page.waitForTimeout(200);
  return true;
}

// Walk the "Choose Field Mappings" step and set each Jama Item Field
// dropdown to the corresponding Excel header from our XLSX. The
// columns we emit match the Jama field names exactly, so each row's
// mapping select can just be set to the same string as the row's
// label.
//
// Strategy: find a leaf element whose exact text equals the Jama
// Item Field label ("Name", "Description", etc.), walk up to its
// containing row (a TR or div with 2-4 child cells and a small
// number of selects suggesting a row, not the whole pane), then
// tag the select via JS so Playwright can target it by id.
async function fillFieldMappingStep(page, wizard, onLog) {
  const MAPPING = {
    "Name":                 "Name",
    "Description":          "Description",
    "Setup":                "Setup",
    "Step Action":          "Step Action",
    "Step Expected Result": "Step Expected Result",
    "Step Notes":           "Step Notes",
    "Automated":            "Automated",
    "Automation Tool":      "Automation Tool",
    "Priority":             "Priority",
  };

  // Diagnostic: dump the actual DOM structure around the first "Name"
  // label INSIDE the wizard so we can see what kind of widget the
  // Mapping column uses.
  const structureDump = await page.evaluate(() => {
    const wizardRoot = document.getElementById("_pw_wizard_root");
    if (!wizardRoot) return { error: "no wizard root" };
    const leaves = Array.from(wizardRoot.querySelectorAll("*"))
      .filter((el) => el.children.length === 0)
      .filter((el) => (el.textContent || "").trim() === "Name");
    if (leaves.length === 0) return { error: "no Name leaf found in wizard" };
    let cur = leaves[0];
    const chain = [];
    for (let i = 0; i < 8 && cur && cur !== wizardRoot; i++) {
      chain.push({
        tag: cur.tagName,
        role: cur.getAttribute("role") || "",
        cls: (cur.className || "").toString().slice(0, 60),
      });
      cur = cur.parentElement;
    }
    const row = cur || leaves[0].parentElement;
    const cells = row ? Array.from(row.children).slice(0, 6).map((c) => ({
      tag: c.tagName,
      role: c.getAttribute("role") || "",
      cls: (c.className || "").toString().slice(0, 40),
      preview: (c.outerHTML || "").slice(0, 200),
    })) : [];
    return { chain, cells };
  });
  onLog("info", `Field-mapping structure around "Name" (in wizard): ${JSON.stringify(structureDump).slice(0, 1200)}`);

  let setCount = 0;
  for (const [label, target] of Object.entries(MAPPING)) {
    const tagId = `_pw_mapsel_${label.replace(/\W+/g, "_")}`;
    const found = await page.evaluate(({ label, tagId }) => {
      const wizardRoot = document.getElementById("_pw_wizard_root");
      if (!wizardRoot) return { ok: false, leafCount: 0 };
      const isVisible = (el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        const cs = window.getComputedStyle(el);
        return cs.visibility !== "hidden" && cs.display !== "none";
      };
      const leaves = Array.from(wizardRoot.querySelectorAll("*"))
        .filter((el) => el.children.length === 0)
        .filter((el) => (el.textContent || "").trim() === label)
        .filter(isVisible);

      for (const leaf of leaves) {
        // Walk up looking for a row-like container: one whose subtree
        // has between 1 and 3 <select>s (a row, not the entire pane).
        let cur = leaf.parentElement;
        for (let depth = 0; depth < 8 && cur && cur !== document.body; depth++) {
          const selects = cur.querySelectorAll("select");
          if (selects.length >= 1 && selects.length <= 3) {
            // Pick the LAST select (the rightmost "Mapping" column).
            const sel = selects[selects.length - 1];
            // Clear any prior tag.
            const prior = document.getElementById(tagId);
            if (prior && prior !== sel) prior.removeAttribute("id");
            sel.id = tagId;
            return { ok: true, optionCount: sel.options.length };
          }
          cur = cur.parentElement;
        }
      }
      return { ok: false, leafCount: leaves.length };
    }, { label, tagId });

    if (!found.ok) {
      onLog("warn", `Field-mapping row for "${label}" not found (${found.leafCount || 0} leaf matches).`);
      continue;
    }

    try {
      await page.locator(`#${tagId}`).selectOption({ label: target });
      setCount++;
    } catch (e) {
      onLog("warn", `Couldn't set mapping for "${label}" → "${target}": ${e.message}`);
    }
  }

  onLog("info", `Set ${setCount}/${Object.keys(MAPPING).length} field mappings.`);

  if (setCount === 0) {
    // No mappings landed — dump diagnostic about the wizard's DOM so
    // we can adjust the row-finding heuristic.
    const dump = await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll("select"));
      return {
        totalSelects: selects.length,
        firstFew: selects.slice(0, 10).map((s) => ({
          id: s.id || "",
          name: s.name || "",
          options: Array.from(s.options).slice(0, 4).map((o) => (o.textContent || "").trim()),
        })),
      };
    });
    onLog("warn", `Wizard <select> dump: ${JSON.stringify(dump).slice(0, 500)}`);
  }
}

// Click a wizard button (Back / Next / Submit / Close / Cancel) by
// visible text. ExtJS doesn't render these as <button> elements — they
// are <a> or <div> styled as buttons — so we find the right one by
// looking for any element inside the wizard whose entire visible text
// is the button label, with a button-sized bounding box.
//
// Always dismisses any blocking warning popup FIRST so the click
// reaches the wizard button instead of being eaten by an overlay.
async function clickWizardButton(wizard, label, onLog = () => {}) {
  await dismissWarningIfPresent(wizard, () => {});
  const page = wizard.page();
  const deadline = Date.now() + 10_000;
  let lastCandidates = [];
  while (Date.now() < deadline) {
    // Tag the outer ExtJS button table (`<table class="x-btn ...">`)
    // since ExtJS attaches its component click handlers there, NOT on
    // the inner <button>. Clicking the inner <button> doesn't fire the
    // ExtJS handler in some configurations.
    const TARGET_TAG = `_pw_wizard_btn_${label.replace(/\W+/g, "_")}`;
    const candidates = await page.evaluate(({ lbl, tagId }) => {
      const wizardRoot = document.getElementById("_pw_wizard_root");
      if (!wizardRoot) return [];
      const isVisible = (el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        const cs = window.getComputedStyle(el);
        return cs.visibility !== "hidden" && cs.display !== "none";
      };
      const out = [];
      for (const el of wizardRoot.querySelectorAll("*")) {
        if (!isVisible(el)) continue;
        const t = (el.textContent || "").trim();
        if (t !== lbl) continue;
        const r = el.getBoundingClientRect();
        if (r.width > 260 || r.height > 80) continue;
        if (r.width < 20 || r.height < 10) continue;
        const cls = (el.className || "").toString();
        out.push({
          el,
          tag: el.tagName,
          cls: cls.slice(0, 60),
          w: Math.round(r.width),
          h: Math.round(r.height),
          score:
            // Strongly prefer the outer ExtJS button table.
            (el.tagName === "TABLE" && cls.includes("x-btn") ? 30 : 0) +
            // Next: any element with "x-btn" class (often the wrapper).
            (cls.split(/\s+/).some((c) => c === "x-btn") ? 20 : 0) +
            (el.tagName === "BUTTON" ? 10 : 0) +
            (el.tagName === "A" ? 8 : 0) +
            (cls.includes("btn") ? 5 : 0) +
            (el.getAttribute("role") === "button" ? 5 : 0) +
            (cls.includes("toolbar-cell") ? -5 : 0) +
            (el.tagName === "TD" ? -3 : 0) +
            (el.tagName === "TR" ? -4 : 0),
        });
      }
      out.sort((a, b) => b.score - a.score);
      if (out.length === 0) return [];
      // Tag the top candidate so the caller can click via Playwright locator.
      const prior = document.getElementById(tagId);
      if (prior && prior !== out[0].el) prior.removeAttribute("id");
      out[0].el.id = tagId;
      // Strip the live DOM ref before returning — only return serializable info.
      return out.map(({ el, ...rest }) => rest);
    }, { lbl: label, tagId: TARGET_TAG });

    if (candidates.length > 0) {
      lastCandidates = candidates;
      const target = candidates[0];
      const all = candidates.slice(0, 4).map((c) => `<${c.tag}.${c.cls.slice(0, 30)} ${c.w}x${c.h} s=${c.score}>`).join(" ");
      onLog("info", `Clicking wizard "${label}": ${all} → top score`);
      await dismissWarningIfPresent(wizard, () => {});

      // Snapshot the wizard's text content before clicking so we can
      // detect whether Playwright's click actually advanced the page.
      // ExtJS reuses the same button DOM across step transitions
      // (rebinding the handler), so checking that our tagged element
      // still exists ISN'T a reliable "did the wizard advance" signal —
      // it almost always still exists, and firing the fallback then
      // double-advances the wizard.
      const textBefore = await page.evaluate(() => {
        const root = document.getElementById("_pw_wizard_root");
        return ((root && root.textContent) || "").trim();
      });

      // Strategy 1: Playwright locator.click — sequences mousedown +
      // mouseup + focus + click better than raw mouse.click(x,y).
      let pwClickOk = true;
      try {
        await page.locator(`#${TARGET_TAG}`).click({ force: true, timeout: 4_000 });
      } catch (e) {
        pwClickOk = false;
        onLog("warn", `locator.click failed (${e.message}); falling back.`);
      }
      await page.waitForTimeout(400);

      // Did the wizard advance? Compare text length — if it changed by
      // more than a small amount, we transitioned to a new step. (Tiny
      // diffs can come from spinner text or warning content; > 30 chars
      // is a reliable signal of a real step change.)
      const advanced = await page.evaluate((prevText) => {
        const root = document.getElementById("_pw_wizard_root");
        const now = ((root && root.textContent) || "").trim();
        return Math.abs(now.length - prevText.length) > 30 || now.slice(0, 200) !== prevText.slice(0, 200);
      }, textBefore);

      if (pwClickOk && advanced) {
        // Click worked, wizard moved on — do NOT fire the fallback.
        return;
      }

      // Strategy 2: Click didn't take effect. Call the ExtJS component
      // handler directly via Ext.getCmp / fireEvent.
      await page.evaluate((tagId) => {
        const el = document.getElementById(tagId);
        if (!el || !window.Ext) return;
        let cur = el;
        for (let i = 0; i < 10 && cur; i++) {
          if (cur.id && /^ext-/i.test(cur.id)) {
            const cmp = window.Ext.getCmp && window.Ext.getCmp(cur.id);
            if (cmp) {
              try {
                if (typeof cmp.handler === "function") {
                  cmp.handler.call(cmp.scope || cmp, cmp);
                  return;
                }
                if (typeof cmp.fireEvent === "function") {
                  cmp.fireEvent("click", cmp);
                  return;
                }
              } catch (_) { /* fall through */ }
            }
          }
          cur = cur.parentElement;
        }
        try {
          el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
          el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
          el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
        } catch (_) {}
      }, TARGET_TAG);
      onLog("info", `Followed up with ExtJS-API/dispatchEvent fallback for "${label}".`);
      return;
    }
    await page.waitForTimeout(150);
  }
  throw new UnexpectedPageState(
    `Wizard button "${label}" didn't become clickable in 10s. ` +
    `Last seen candidates: ${JSON.stringify(lastCandidates).slice(0, 400)}`
  );
}

// Dismiss any Jama warning/error popup. The popup is a `<div
// class="x-window x-window-plain">` containing a footer toolbar with
// up to four buttons (OK / Yes / No / Cancel) — only some are
// visible per dialog. We find the dialog by class, locate its
// individual button cells, and click the OK button via the ExtJS
// component handler (which is reliable across this version of Jama).
//
// The Ext.Msg/WindowMgr API path doesn't catch this popup — it's not
// a managed Ext.Msg in this Jama build.
// A warning dialog is `<div class="x-window x-window-plain x-window-dlg">`
// with header text "Warning" / "Error". The Import progress modal also
// shares `x-window-plain` but it's actually `j-progress-window` with
// header "Import Items" — that's NOT a warning. Per the user, a
// progress modal also flashes briefly when entering the mapping page
// BEFORE the warning appears, so we have to wait for the warning to
// actually show up before dismissing.
async function dismissWarningIfPresent(wizard, onLog) {
  const page = wizard.page();
  const isWarningVisible = () => page.evaluate(() => {
    const isVisible = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      const cs = window.getComputedStyle(el);
      return cs.visibility !== "hidden" && cs.display !== "none";
    };
    const wins = Array.from(document.querySelectorAll(".x-window-plain"));
    for (const w of wins) {
      if (!isVisible(w)) continue;
      // Exclude progress modals.
      if (w.classList.contains("j-progress-window")) continue;
      // Identify by header text.
      const header = w.querySelector(".x-window-header-text");
      const headerText = ((header && header.textContent) || "").trim();
      if (headerText === "Warning" || headerText === "Error" || w.classList.contains("x-window-dlg")) {
        return true;
      }
    }
    return false;
  });

  // Wait up to 3s for the warning to actually appear. If it never
  // shows up, there's nothing to dismiss.
  const appearDeadline = Date.now() + 3_000;
  while (Date.now() < appearDeadline) {
    if (await isWarningVisible()) break;
    await page.waitForTimeout(150);
  }
  if (!(await isWarningVisible())) {
    onLog("info", "No warning popup appeared within 3s; continuing.");
    return;
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    if (!(await isWarningVisible())) return;

    // The popup has keyboard focus by default — pressing Enter triggers
    // the OK button without any selector hunting. This matches the
    // user's manual workflow.
    await page.keyboard.press("Enter");
    await page.waitForTimeout(400);
    if (!(await isWarningVisible())) {
      onLog("info", `Dismissed warning popup via Enter key (attempt ${attempt + 1}).`);
      continue; // recheck for stacked warnings
    }

    // Enter didn't clear it — fall back to clicking the OK x-btn.
    const result = await page.evaluate(() => {
      const isVisible = (el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        const cs = window.getComputedStyle(el);
        return cs.visibility !== "hidden" && cs.display !== "none";
      };

      // Find visible warning dialogs only — exclude progress modals
      // (j-progress-window) which share the .x-window-plain class.
      const warnings = Array.from(document.querySelectorAll(".x-window-plain"))
        .filter(isVisible)
        .filter((w) => !w.classList.contains("j-progress-window"));
      if (warnings.length === 0) return { kind: "none" };
      const warning = warnings[0];

      // ExtJS toolbar buttons render as <table class="x-btn"> wrapping
      // an <em><button>label</button></em>. Each table.x-btn is a
      // single button with its own click handler bound via Ext.getCmp.
      const btnTables = Array.from(warning.querySelectorAll("table.x-btn"))
        .filter(isVisible);
      const dialogButtons = btnTables.map((t) => {
        const r = t.getBoundingClientRect();
        return {
          el: t,
          text: (t.textContent || "").trim(),
          id: t.id || "",
          w: Math.round(r.width),
          h: Math.round(r.height),
        };
      });

      const ok = dialogButtons.find((b) => /^ok$/i.test(b.text));
      if (ok) {
        // Fire the ExtJS handler if we can resolve the component.
        let handlerFired = false;
        try {
          if (ok.id && window.Ext && window.Ext.getCmp) {
            const cmp = window.Ext.getCmp(ok.id);
            if (cmp && typeof cmp.handler === "function") {
              cmp.handler.call(cmp.scope || cmp, cmp);
              handlerFired = true;
            } else if (cmp && typeof cmp.fireEvent === "function") {
              cmp.fireEvent("click", cmp);
              handlerFired = true;
            }
          }
        } catch (_) {}

        // DOM click as fallback. Click the inner <button> if present,
        // otherwise the table itself.
        try {
          const inner = ok.el.querySelector("button");
          if (inner) inner.click();
          else ok.el.click();
        } catch (_) {}

        return { kind: "clicked", handlerFired, label: ok.text, btnSize: `${ok.w}x${ok.h}` };
      }

      // No OK x-btn found — collect a structural dump of the warning
      // so we can see what's actually in there.
      const dump = [];
      const walk = (el, depth) => {
        if (depth > 6) return;
        const r = el.getBoundingClientRect();
        const t = (el.textContent || "").trim().slice(0, 30);
        const cls = (el.className || "").toString().slice(0, 40);
        dump.push(
          `${"  ".repeat(depth)}<${el.tagName}.${cls} id="${el.id || ""}" text="${t}" ${Math.round(r.width)}x${Math.round(r.height)}>`,
        );
        for (const c of el.children) walk(c, depth + 1);
      };
      walk(warning, 0);

      return {
        kind: "no-ok",
        seenTables: dialogButtons.map((b) => `${b.text || "(empty)"}(${b.w}x${b.h})`),
        dump: dump.slice(0, 40),
      };
    });

    if (result.kind === "none") return; // no warning open
    if (result.kind === "clicked") {
      onLog(
        "info",
        `Dismissed warning popup (OK button ${result.btnSize}, handler=${result.handlerFired}, attempt ${attempt + 1}).`,
      );
      await page.waitForTimeout(400);
      continue; // recheck for stacked warnings
    }
    if (result.kind === "no-ok") {
      onLog(
        "warn",
        `Warning popup present but no OK x-btn found. table.x-btn seen: [${result.seenTables.join(", ")}]. Dump:\n${result.dump.join("\n")}`,
      );
      return;
    }
  }
}

// Read either "imported N items" (success) or an "Import Error"
// message (failure) from the final wizard step. Polls up to maxWaitMs
// because after Submit, Jama shows an "Import Items / Parsing Rows and
// Creating Items / N of M" progress modal that can run for many seconds
// before the success message appears.
//
// Returns:
//   { count: N }           - successful import
//   { error: "message" }   - import failed inside Jama
//   null                   - wizard never reached either marker
async function readImportSummary(page, onLog = () => {}, maxWaitMs = 120_000) {
  const deadline = Date.now() + maxWaitMs;
  let loggedProgress = false;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => {
      const isVisible = (el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        const cs = window.getComputedStyle(el);
        return cs.visibility !== "hidden" && cs.display !== "none";
      };

      const bodyText = document.body.textContent || "";
      const successMatch = bodyText.match(/imported\s+(\d+)\s+items?/i);
      if (successMatch) return { kind: "success", count: parseInt(successMatch[1], 10) };

      // Detect the "Import Items" progress modal so we can keep waiting.
      // The header is "Import Items"; the body has "Parsing Rows and
      // Creating Items" and a "N of M" counter.
      let progress = null;
      for (const el of document.querySelectorAll("*")) {
        if (!isVisible(el)) continue;
        const t = (el.textContent || "").trim();
        if (t.includes("Parsing Rows and Creating Items")) {
          // Find the counter text within the same window.
          const counter = bodyText.match(/(\d+)\s+of\s+(\d+)/);
          progress = counter ? `${counter[1]} of ${counter[2]}` : "in progress";
          break;
        }
      }
      if (progress) return { kind: "progress", progress };

      // Look for an Import Error popup. The header says "Import Error"
      // and the body has the error description.
      const errorHeaders = Array.from(document.querySelectorAll("*"))
        .filter((el) => el.children.length === 0)
        .filter((el) => (el.textContent || "").trim() === "Import Error");
      if (errorHeaders.length === 0) return { kind: "none" };

      // Walk up to find the dialog container, then capture its body.
      let cur = errorHeaders[0].parentElement;
      for (let i = 0; i < 10 && cur; i++) {
        const text = (cur.textContent || "").trim();
        if (text.length > 30 && text.includes("Import Error")) {
          const msg = text.replace(/^Import Error\s*/, "").slice(0, 300);
          return { kind: "error", message: msg };
        }
        cur = cur.parentElement;
      }
      return { kind: "error", message: "Import Error (couldn't capture details)" };
    });

    if (state.kind === "success") return { count: state.count };
    if (state.kind === "error") return { error: state.message };
    if (state.kind === "progress") {
      if (!loggedProgress) {
        onLog("info", `Jama import in progress (${state.progress})...`);
        loggedProgress = true;
      }
    }
    await page.waitForTimeout(500);
  }
  return null;
}

// ─── Tree helpers (Explorer sidebar) ─────────────────────────────────────

// Poll until the named tree node appears in the DOM. Used right after
// page navigation to bridge the gap between Jama's loading placeholder
// (value="loading") and the real project rows.
async function waitForTreeNode(page, jamaId, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const ok = await page.evaluate((targetValue) => {
      const rows = Array.from(document.querySelectorAll('[role="treeitem"]'));
      return rows.some((el) => el.getAttribute("value") === targetValue);
    }, jamaId);
    if (ok) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

// Expand a tree row identified by its jama_id. Returns true on success,
// false if the row can't be found even after scrolling the virtualized
// list. Jama's tree framework only responds to Playwright's trusted
// clicks — synthetic `element.click()` via evaluate is silently ignored.
async function expandRowByValue(page, jamaId, onLog) {
  const found = await scrollRowIntoView(page, jamaId, onLog);
  if (!found) return false;
  if (found.alreadyExpanded) return true;
  try {
    await found.row.locator('[data-automation="node-expander"]').first()
      .click({ force: true, noWaitAfter: true, timeout: 4_000 });
  } catch (e) {
    onLog("warn", `Click on expander for ${jamaId} failed: ${e.message}`);
    return false;
  }
  await page.waitForTimeout(300);
  return true;
}

// Scroll the virtualized tree until the requested row is in the DOM.
// Returns { row, alreadyExpanded } if found, null otherwise. Uses
// evaluate() to read attributes off the live DOM — CSS attribute
// selectors against `value` were flaky for non-input elements.
async function scrollRowIntoView(page, jamaId, onLog = () => {}) {
  await scrollTreeTo(page, 0);
  await page.waitForTimeout(120);

  const seen = new Map();
  for (let attempts = 0; attempts < 200; attempts++) {
    const state = await page.evaluate((targetValue) => {
      const rows = Array.from(document.querySelectorAll('[role="treeitem"]'));
      const all = rows.map((el) => ({
        value: el.getAttribute("value"),
        title: el.getAttribute("title"),
        level: el.getAttribute("aria-level"),
        expanded: el.getAttribute("aria-expanded"),
      }));
      const row = rows.find((el) => el.getAttribute("value") === targetValue);
      if (!row) return { found: false, all };
      return {
        found: true,
        alreadyExpanded: row.getAttribute("aria-expanded") === "true",
        all,
      };
    }, jamaId);

    for (const r of state.all || []) {
      if (r.value && !seen.has(r.value)) seen.set(r.value, r);
    }

    if (state.found) {
      const row = page.locator(`xpath=//*[@role="treeitem" and @value="${xpathEscape(jamaId)}"]`).first();
      return { row, alreadyExpanded: state.alreadyExpanded };
    }

    const moved = await scrollTreeBy(page, 400);
    if (!moved) break;
    await page.waitForTimeout(100);
  }

  const dump = Array.from(seen.values())
    .slice(0, 40)
    .map((r) => `${r.value}(L${r.level} "${r.title}")`)
    .join(", ");
  onLog("warn", `Target tree node ${jamaId} not found. Saw: ${dump || "(no rows)"}`);
  return null;
}

async function scrollTreeTo(page, top) {
  await page.evaluate((scrollTop) => {
    const anyItem = document.querySelector('[role="treeitem"]');
    if (!anyItem) return;
    let el = anyItem.parentElement;
    while (el && el !== document.body) {
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
    while (el && el !== document.body) {
      if (el.scrollHeight > el.clientHeight) {
        const before = el.scrollTop;
        el.scrollTop = Math.min(before + d, el.scrollHeight - el.clientHeight);
        return el.scrollTop !== before;
      }
      el = el.parentElement;
    }
    return false;
  }, delta);
}

function xpathEscape(s) {
  return String(s);
}

// ─── Context-menu navigation ─────────────────────────────────────────────

// Walk a chain of context-menu items by hovering each in turn, using a
// DOM-diff approach so we don't need to guess Jama's menu CSS class.
// Compare a snapshot taken BEFORE the menu opened against the current
// DOM; new leaf-text elements ARE the menu items.
async function clickContextMenuChain(page, onLog, priorSnapshot, labels) {
  let baseline = new Set(priorSnapshot);

  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    const isLast = i === labels.length - 1;

    let target = null;
    const deadline = Date.now() + 4_000;
    while (Date.now() < deadline) {
      target = await findNewLeafByText(page, baseline, label);
      if (target) break;
      await page.waitForTimeout(120);
    }
    if (!target) {
      const dump = await snapshotVisibleLeavesDiff(page, baseline);
      onLog("warn", `New leaves visible at failure: ${dump.slice(0, 50).join(" | ") || "(none)"}`);
      throw new UnexpectedPageState(
        `Context menu item "${label}" didn't appear within 4000ms.`
      );
    }

    baseline = new Set(await snapshotVisibleLeaves(page));

    if (isLast) {
      await page.mouse.move(target.cx, target.cy);
      await page.waitForTimeout(60);
      await page.mouse.click(target.cx, target.cy);
    } else {
      await page.mouse.move(target.cx, target.cy);
      await page.waitForTimeout(300);
    }
  }
}

async function snapshotVisibleLeaves(page) {
  return await page.evaluate(() => {
    const isVisible = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      const cs = window.getComputedStyle(el);
      return cs.visibility !== "hidden" && cs.display !== "none";
    };
    const out = [];
    for (const el of document.querySelectorAll("*")) {
      if (el.children.length > 0) continue;
      const t = (el.textContent || "").trim();
      if (!t) continue;
      if (!isVisible(el)) continue;
      const r = el.getBoundingClientRect();
      out.push(`${t}|${Math.round(r.left)},${Math.round(r.top)}`);
    }
    return out;
  });
}

async function findNewLeafByText(page, baseline, label) {
  const baselineArr = Array.from(baseline);
  return await page.evaluate(({ baselineList, needle }) => {
    const baseline = new Set(baselineList);
    const isVisible = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      const cs = window.getComputedStyle(el);
      return cs.visibility !== "hidden" && cs.display !== "none";
    };
    for (const el of document.querySelectorAll("*")) {
      if (el.children.length > 0) continue;
      const t = (el.textContent || "").trim();
      if (t !== needle) continue;
      if (!isVisible(el)) continue;
      const r = el.getBoundingClientRect();
      const key = `${t}|${Math.round(r.left)},${Math.round(r.top)}`;
      if (baseline.has(key)) continue;
      return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    }
    return null;
  }, { baselineList: baselineArr, needle: label });
}

async function snapshotVisibleLeavesDiff(page, baseline) {
  const now = await snapshotVisibleLeaves(page);
  return now.filter((s) => !baseline.has(s)).map((s) => s.split("|")[0]);
}

module.exports = {
  navigateToSetNode,
  importTestCasesXlsx,
  NOT_IMPLEMENTED_CODE,
};
