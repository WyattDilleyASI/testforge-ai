// ═══════════════════════════════════════════════════════════════════════════
// KB Seeding Wizard — bulk content extraction into curated KB entries
// ═══════════════════════════════════════════════════════════════════════════
//
// Two-pass pipeline:
//   Pass 1 (extraction):     raw text → Batch API → candidates
//                            uploaded images → Claude vision → candidates
//   Pass 2 (cross-reference): candidates × requirements → suggested links
//
// Candidates flow through review status into kb_entries on accept.
// All routes require Admin or QA Manager.
//
// Async coordination: POST /jobs returns 202 immediately. The Batch API
// runs asynchronously; the GET /jobs/:jobId route opportunistically polls
// batch status on each call and advances the job state machine. No
// background worker required.

const express = require("express");
const multer = require("multer");

const {
  getDb, getKbDb, getReqDb, logAudit,
  saveImage,
  readSeedingImage,
  readSeedingImageBase64,
  deleteSeedingImage,
  deleteSeedingImageDir,
} = require("../db");
const { requireAuth, requireRole } = require("../auth");

const { parseInputFile, chunkText } = require("../kb-seeding/parser");
const { getBatchStatus } = require("../kb-seeding/batch");
const {
  submitExtractionBatch,
  ingestExtractionResults,
} = require("../kb-seeding/extraction");
const { processImageCandidates } = require("../kb-seeding/image-extraction");
const {
  submitXrefBatch,
  ingestXrefResults,
} = require("../kb-seeding/xref");

const router = express.Router();

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_TOTAL_CHARS = 1024 * 1024;  // 1MB extracted text per job
const CHUNK_CHARS = 120000;           // ~30K input tokens per extraction chunk
const MAX_FILE_SIZE = 10 * 1024 * 1024;  // 10 MB — accommodates images

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

// ─── ID generation ──────────────────────────────────────────────────────────

function nextJobId() {
  const row = getKbDb()
    .prepare("SELECT COUNT(*) AS c FROM kb_seeding_jobs")
    .get();
  return `SEED-${String(row.c + 1).padStart(3, "0")}`;
}

// ─── JSON helpers ───────────────────────────────────────────────────────────

function safeJson(str, fallback) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

// ─── Response builders ──────────────────────────────────────────────────────

// Build the response shape for GET /jobs/:jobId.
function buildJobResponse(jobId) {
  const db = getKbDb();
  const job = db
    .prepare("SELECT * FROM kb_seeding_jobs WHERE job_id = ?")
    .get(jobId);
  if (!job) return null;

  const counts = db.prepare(`
    SELECT status, COUNT(*) AS c
    FROM kb_seeding_candidates
    WHERE job_id = ?
    GROUP BY status
  `).all(jobId);

  const candidate_counts = {
    pending_review: 0,
    accepted: 0,
    edited_accepted: 0,
    rejected: 0,
  };
  for (const row of counts) candidate_counts[row.status] = row.c;

  return {
    job_id: job.job_id,
    created_by: job.created_by,
    created_at: job.created_at,
    status: job.status,
    model_version: job.model_version,
    default_subsection_id: job.default_subsection_id,
    input_summary: safeJson(job.input_summary, null),
    batch_status: {
      extract: job.batch_id_extract
        ? (job.status === "extracting" ? "in_progress" : "completed")
        : null,
      xref: job.batch_id_xref
        ? (job.status === "cross_referencing" ? "in_progress" : "completed")
        : null,
    },
    candidate_counts,
    stats: safeJson(job.stats, null),
    error: job.error,
    completed_at: job.completed_at,
  };
}

// Build the response shape for a candidate, enriching xref matches with
// requirement display metadata via a single lookup query (avoids N+1).
function buildCandidateResponse(candidateRow) {
  if (!candidateRow) return null;

  const matches = getKbDb().prepare(`
    SELECT * FROM kb_seeding_xref_matches
    WHERE candidate_id = ?
    ORDER BY confidence DESC NULLS LAST
  `).all(candidateRow.candidate_id);

  // Cross-DB enrichment: fetch all req metadata in one query
  let enrichedMatches = [];
  if (matches.length > 0) {
    const reqIds = [...new Set(matches.map(m => m.req_id))];
    const placeholders = reqIds.map(() => "?").join(",");
    const reqRows = getReqDb().prepare(`
      SELECT req_id, title, module
      FROM requirements
      WHERE req_id IN (${placeholders})
    `).all(...reqIds);
    const reqMap = Object.fromEntries(reqRows.map(r => [r.req_id, r]));

    enrichedMatches = matches.map(m => ({
      match_id: m.match_id,
      req_id: m.req_id,
      confidence: m.confidence,
      justification: m.justification,
      auto_applied: !!m.auto_applied,
      user_decision: m.user_decision,
      req_title: reqMap[m.req_id]?.title || null,
      req_module: reqMap[m.req_id]?.module || null,
    }));
  }

  return {
    candidate_id: candidateRow.candidate_id,
    job_id: candidateRow.job_id,
    title: candidateRow.title,
    type: candidateRow.type,
    content: candidateRow.content,
    suggested_tags: safeJson(candidateRow.suggested_tags, []),
    subsection_id: candidateRow.subsection_id,
    pinned: !!candidateRow.pinned,
    extraction_confidence: candidateRow.extraction_confidence,
    source_url: candidateRow.source_url,
    source_input_ref: safeJson(candidateRow.source_input_ref, null),
    status: candidateRow.status,
    final_kb_id: candidateRow.final_kb_id,
    user_edits: safeJson(candidateRow.user_edits, null),
    reviewed_at: candidateRow.reviewed_at,
    reviewed_by: candidateRow.reviewed_by,
    xref_matches: enrichedMatches,
    media_type: candidateRow.media_type || null,
    image_file: candidateRow.image_file || null,
  };
}

// ─── Opportunistic batch sync ───────────────────────────────────────────────

// Called from GET /jobs/:jobId. Uses guarded UPDATE for idempotency under
// concurrent polling — only one caller advances the state machine per stage.
async function maybeSyncJob(jobId) {
  const db = getKbDb();
  const job = db
    .prepare("SELECT * FROM kb_seeding_jobs WHERE job_id = ?")
    .get(jobId);
  if (!job) return;

  // ── Pass 1: extraction ──
  if (job.status === "extracting" && job.batch_id_extract) {
    let status;
    try { status = await getBatchStatus(job.batch_id_extract); }
    catch (err) { console.error(`Batch status check failed for ${jobId}:`, err); return; }

    if (status === "ended") {
      const claim = db.prepare(`
        UPDATE kb_seeding_jobs
        SET status = 'cross_referencing'
        WHERE job_id = ? AND status = 'extracting'
      `).run(jobId);

      if (claim.changes === 1) {
        try {
          await ingestExtractionResults(jobId);

          // Auto-trigger Pass 2 (per design decision: auto_run_xref always on)
          const xrefBatchId = await submitXrefBatch(jobId);
          if (xrefBatchId) {
            db.prepare(`
              UPDATE kb_seeding_jobs SET batch_id_xref = ? WHERE job_id = ?
            `).run(xrefBatchId, jobId);
          } else {
            // No candidates to xref (extraction yielded nothing). Skip to review.
            db.prepare(`
              UPDATE kb_seeding_jobs SET status = 'review' WHERE job_id = ?
            `).run(jobId);
          }
        } catch (err) {
          console.error(`Extraction ingestion failed for ${jobId}:`, err);
          db.prepare(`
            UPDATE kb_seeding_jobs
            SET status = 'failed', error = ?
            WHERE job_id = ?
          `).run(err.message, jobId);
        }
      }
    } else if (status === "failed" || status === "expired" || status === "canceled") {
      db.prepare(`
        UPDATE kb_seeding_jobs
        SET status = 'failed', error = ?
        WHERE job_id = ?
      `).run(`Extraction batch ${status}`, jobId);
    }
  }

  // ── Pass 2: cross-reference ──
  if (job.status === "cross_referencing" && job.batch_id_xref) {
    let status;
    try { status = await getBatchStatus(job.batch_id_xref); }
    catch (err) { console.error(`Xref status check failed for ${jobId}:`, err); return; }

    if (status === "ended") {
      const claim = db.prepare(`
        UPDATE kb_seeding_jobs
        SET status = 'review'
        WHERE job_id = ? AND status = 'cross_referencing'
      `).run(jobId);

      if (claim.changes === 1) {
        try {
          await ingestXrefResults(jobId);
        } catch (err) {
          console.error(`Xref ingestion failed for ${jobId}:`, err);
          db.prepare(`
            UPDATE kb_seeding_jobs
            SET status = 'failed', error = ?
            WHERE job_id = ?
          `).run(err.message, jobId);
        }
      }
    } else if (status === "failed" || status === "expired" || status === "canceled") {
      // Xref failure isn't fatal — user can still review candidates without
      // requirement suggestions. Mark job as 'review' but record the error.
      db.prepare(`
        UPDATE kb_seeding_jobs
        SET status = 'review', error = ?
        WHERE job_id = ?
      `).run(`Cross-reference batch ${status}`, jobId);
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// JOB MANAGEMENT
// ════════════════════════════════════════════════════════════════════════════

// POST /api/kb/seeding/jobs — Create a job; kicks off Pass 1
//
// Files are split by source_type at parse time:
//   - text-like (txt, md, html, docx, plus pasted content) → Batch API
//   - images (png, jpg, webp)                              → Claude vision (sync)
//
// Mixed jobs are common: image candidates land synchronously before this
// route returns, while the text batch runs async in the background and
// GET /jobs/:jobId advances the state machine when it completes.
router.post(
  "/jobs",
  requireRole("Admin", "QA Manager"),
  upload.array("files"),
  async (req, res) => {
    try {
      const { content, default_subsection_id } = req.body;

      // Validate subsection if provided
      if (default_subsection_id) {
        const sub = getKbDb()
          .prepare("SELECT * FROM kb_subsections WHERE subsection_id = ?")
          .get(default_subsection_id);
        if (!sub) {
          return res.status(400).json({ error: "Invalid default_subsection_id" });
        }
      }

      // Split inputs by source_type
      const textInputs = [];
      const imageInputs = [];

      if (content && content.trim()) {
        textInputs.push({
          source: "pasted",
          name: "pasted_text",
          text: content,
          source_type: "text",
        });
      }

      for (const file of req.files || []) {
        try {
          const parsed = await parseInputFile(file);
          if (parsed.source_type === "image") {
            imageInputs.push(parsed);
          } else if (parsed.text && parsed.text.trim()) {
            textInputs.push({
              source: "upload",
              name: file.originalname,
              text: parsed.text,
              source_type: parsed.source_type,
            });
          }
        } catch (err) {
          return res.status(400).json({
            error: `Failed to parse ${file.originalname}: ${err.message}`,
          });
        }
      }

      if (textInputs.length === 0 && imageInputs.length === 0) {
        return res.status(400).json({ error: "No content provided" });
      }

      // Text size cap (images don't contribute to this)
      const totalChars = textInputs.reduce((sum, i) => sum + i.text.length, 0);
      if (totalChars > MAX_TOTAL_CHARS) {
        return res.status(413).json({
          error: `Total text content (${totalChars} chars) exceeds limit (${MAX_TOTAL_CHARS}). Split into multiple jobs.`,
        });
      }

      // Create job row
      const jobId = nextJobId();
      const sourceTypes = [
        ...new Set([
          ...textInputs.map(i => i.source_type),
          ...(imageInputs.length > 0 ? ["image"] : []),
        ]),
      ];
      const inputSummary = {
        file_count: req.files ? req.files.length : 0,
        pasted_chars: content ? content.length : 0,
        total_chars: totalChars,
        image_count: imageInputs.length,
        source_types: sourceTypes,
      };

      getKbDb().prepare(`
        INSERT INTO kb_seeding_jobs
          (job_id, created_by, created_at, status, input_summary,
           default_subsection_id, model_version)
        VALUES (?, ?, ?, 'extracting', ?, ?, ?)
      `).run(
        jobId,
        req.session.name,
        new Date().toISOString(),
        JSON.stringify(inputSummary),
        default_subsection_id || null,
        process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514"
      );

      // Pass 1a: image extraction (synchronous). Per-image errors are
      // isolated inside processImageCandidates; we only fail the whole
      // job if the function itself throws.
      let imageResult = { processed: 0, candidates: 0, errors: 0 };
      if (imageInputs.length > 0) {
        try {
          imageResult = await processImageCandidates(jobId, imageInputs);
        } catch (err) {
          console.error(`Image extraction failed for ${jobId}:`, err);
          getKbDb().prepare(`
            UPDATE kb_seeding_jobs
            SET status = 'failed', error = ?
            WHERE job_id = ?
          `).run(`Image extraction failed: ${err.message}`, jobId);
          return res.status(500).json({
            error: `Image extraction failed: ${err.message}`,
          });
        }
      }

      // Pass 1b: text extraction (Batch API, async). Job stays in
      // 'extracting' until GET /jobs/:jobId observes batch completion
      // and advances the state machine.
      //
      // If image-only, advance directly to xref or review since there's
      // no batch to wait on.
      let chunkCount = 0;
      if (textInputs.length > 0) {
        const chunks = [];
        for (const input of textInputs) {
          const inputChunks = chunkText(input.text, CHUNK_CHARS);
          inputChunks.forEach((chunk, idx) => {
            chunks.push({
              text: chunk,
              source_name: input.name,
              chunk_index: idx,
              source_url: null,
            });
          });
        }
        chunkCount = chunks.length;
        await submitExtractionBatch(jobId, chunks);
      } else if (imageResult.candidates > 0) {
        // Image-only job with candidates: kick off xref directly.
        try {
          const xrefBatchId = await submitXrefBatch(jobId);
          if (xrefBatchId) {
            getKbDb().prepare(`
              UPDATE kb_seeding_jobs
              SET status = 'cross_referencing', batch_id_xref = ?
              WHERE job_id = ?
            `).run(xrefBatchId, jobId);
          } else {
            getKbDb().prepare(`
              UPDATE kb_seeding_jobs SET status = 'review' WHERE job_id = ?
            `).run(jobId);
          }
        } catch (err) {
          // Xref submission failure isn't fatal — user can still review.
          console.error(`Xref submission failed for ${jobId}:`, err);
          getKbDb().prepare(`
            UPDATE kb_seeding_jobs
            SET status = 'review', error = ?
            WHERE job_id = ?
          `).run(`Cross-reference submission failed: ${err.message}`, jobId);
        }
      } else {
        // Image-only job that produced zero candidates — straight to review.
        getKbDb().prepare(`
          UPDATE kb_seeding_jobs SET status = 'review' WHERE job_id = ?
        `).run(jobId);
      }

      logAudit(
        req.session.name,
        "KB_SEEDING_JOB_CREATED",
        `Created seeding job ${jobId} ` +
          `(${chunkCount} text chunks, ${totalChars} chars, ` +
          `${imageInputs.length} images → ${imageResult.candidates} candidates)`
      );

      // Read final status — image-only jobs may have advanced past 'extracting'
      const finalJob = getKbDb()
        .prepare("SELECT status FROM kb_seeding_jobs WHERE job_id = ?")
        .get(jobId);

      return res.status(202).json({
        job_id: jobId,
        status: finalJob.status,
        chunks: chunkCount,
        total_chars: totalChars,
        image_candidates: imageResult.candidates,
        image_errors: imageResult.errors,
      });
    } catch (err) {
      console.error("Seeding job creation error:", err);
      return res.status(500).json({ error: err.message });
    }
  }
);

// GET /api/kb/seeding/jobs — List jobs
router.get("/jobs", requireAuth, (req, res) => {
  const { status, limit = 50 } = req.query;

  let sql = "SELECT job_id FROM kb_seeding_jobs";
  const params = [];
  if (status) {
    sql += " WHERE status = ?";
    params.push(status);
  }
  sql += " ORDER BY created_at DESC LIMIT ?";
  params.push(parseInt(limit) || 50);

  const rows = getKbDb().prepare(sql).all(...params);
  const jobs = rows.map(r => buildJobResponse(r.job_id));
  return res.json({ jobs });
});

// GET /api/kb/seeding/jobs/:jobId — Get job detail + opportunistic sync
router.get("/jobs/:jobId", requireAuth, async (req, res) => {
  const { jobId } = req.params;
  const exists = getKbDb()
    .prepare("SELECT 1 FROM kb_seeding_jobs WHERE job_id = ?")
    .get(jobId);
  if (!exists) return res.status(404).json({ error: "Job not found" });

  // Opportunistic sync — advances state machine if batches have completed
  await maybeSyncJob(jobId);

  return res.json(buildJobResponse(jobId));
});

// POST /api/kb/seeding/jobs/:jobId/xref — Manually trigger Pass 2
// Used when new requirements have been imported and the user wants to
// re-run cross-reference against them. Only valid in 'review' state.
router.post(
  "/jobs/:jobId/xref",
  requireRole("Admin", "QA Manager"),
  async (req, res) => {
    const { jobId } = req.params;
    const db = getKbDb();
    const job = db
      .prepare("SELECT * FROM kb_seeding_jobs WHERE job_id = ?")
      .get(jobId);

    if (!job) return res.status(404).json({ error: "Job not found" });
    if (job.status !== "review") {
      return res.status(409).json({
        error: `Job must be in 'review' state to re-run xref (current: ${job.status})`,
      });
    }

    try {
      const batchId = await submitXrefBatch(jobId);
      if (!batchId) {
        return res.status(400).json({ error: "No candidates to cross-reference" });
      }
      db.prepare(`
        UPDATE kb_seeding_jobs
        SET status = 'cross_referencing', batch_id_xref = ?
        WHERE job_id = ?
      `).run(batchId, jobId);

      logAudit(
        req.session.name,
        "KB_SEEDING_XREF_TRIGGERED",
        `Manually re-triggered xref for ${jobId}`
      );

      return res.json({ ok: true, status: "cross_referencing" });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

// POST /api/kb/seeding/jobs/:jobId/finalize — Mark job complete
router.post(
  "/jobs/:jobId/finalize",
  requireRole("Admin", "QA Manager"),
  (req, res) => {
    const { jobId } = req.params;
    const db = getKbDb();
    const job = db
      .prepare("SELECT * FROM kb_seeding_jobs WHERE job_id = ?")
      .get(jobId);

    if (!job) return res.status(404).json({ error: "Job not found" });
    if (job.status === "completed") {
      return res.status(409).json({ error: "Job already finalized" });
    }
    if (job.status !== "review") {
      return res.status(409).json({
        error: `Job must be in 'review' state to finalize (current: ${job.status})`,
      });
    }

    // Auto-reject any remaining pending candidates
    db.prepare(`
      UPDATE kb_seeding_candidates
      SET status = 'rejected',
          reviewed_at = ?,
          reviewed_by = 'system_finalize'
      WHERE job_id = ? AND status = 'pending_review'
    `).run(new Date().toISOString(), jobId);

    // Compute stats
    const counts = db.prepare(`
      SELECT status, COUNT(*) AS c
      FROM kb_seeding_candidates
      WHERE job_id = ?
      GROUP BY status
    `).all(jobId);

    const stats = {
      accepted: 0, edited_accepted: 0, rejected: 0, pending_review: 0,
    };
    for (const row of counts) stats[row.status] = row.c;
    stats.total = Object.values(stats).reduce((a, b) => a + b, 0);

    // Count requirements linked across all accepted candidates
    const linkRow = db.prepare(`
      SELECT COUNT(DISTINCT m.req_id) AS req_count
      FROM kb_seeding_xref_matches m
      JOIN kb_seeding_candidates c ON c.candidate_id = m.candidate_id
      WHERE c.job_id = ?
        AND c.status IN ('accepted', 'edited_accepted')
        AND m.user_decision IN ('kept', 'manually_added')
    `).get(jobId);
    stats.requirements_linked = linkRow.req_count;

    db.prepare(`
      UPDATE kb_seeding_jobs
      SET status = 'completed', stats = ?, completed_at = ?
      WHERE job_id = ?
    `).run(JSON.stringify(stats), new Date().toISOString(), jobId);

    // Sweep any leftover seeding images for this job. Accepted ones have
    // already been moved out; rejected ones may still be on disk if the
    // per-candidate best-effort cleanup failed.
    try { deleteSeedingImageDir(jobId); }
    catch (err) {
      console.error(`Failed to clean up seeding images for ${jobId}:`, err);
    }

    logAudit(
      req.session.name,
      "KB_SEEDING_JOB_FINALIZED",
      `Finalized ${jobId}: ${stats.accepted + stats.edited_accepted} accepted, ${stats.rejected} rejected`
    );

    return res.json({ ok: true, stats });
  }
);

// DELETE /api/kb/seeding/jobs/:jobId — Cancel a job
router.delete(
  "/jobs/:jobId",
  requireRole("Admin", "QA Manager"),
  (req, res) => {
    const { jobId } = req.params;
    const db = getKbDb();
    const job = db
      .prepare("SELECT * FROM kb_seeding_jobs WHERE job_id = ?")
      .get(jobId);

    if (!job) return res.status(404).json({ error: "Job not found" });
    if (job.status === "completed") {
      return res.status(409).json({ error: "Cannot delete a completed job" });
    }

    // Cascade: delete matches → candidates → job
    const txn = db.transaction(() => {
      db.prepare(`
        DELETE FROM kb_seeding_xref_matches
        WHERE candidate_id IN (
          SELECT candidate_id FROM kb_seeding_candidates WHERE job_id = ?
        )
      `).run(jobId);
      db.prepare("DELETE FROM kb_seeding_candidates WHERE job_id = ?").run(jobId);
      db.prepare("DELETE FROM kb_seeding_jobs WHERE job_id = ?").run(jobId);
    });
    txn();

    // Sweep seeding images for this cancelled job
    try { deleteSeedingImageDir(jobId); }
    catch (err) {
      console.error(`Failed to clean up seeding images for ${jobId}:`, err);
    }

    logAudit(req.session.name, "KB_SEEDING_JOB_CANCELLED", `Cancelled ${jobId}`);
    return res.json({ ok: true });
  }
);

// ════════════════════════════════════════════════════════════════════════════
// CANDIDATE REVIEW
// ════════════════════════════════════════════════════════════════════════════

// GET /api/kb/seeding/jobs/:jobId/candidates — List candidates for a job
router.get("/jobs/:jobId/candidates", requireAuth, (req, res) => {
  const { jobId } = req.params;
  const { status, limit = 200, offset = 0 } = req.query;

  let sql = "SELECT * FROM kb_seeding_candidates WHERE job_id = ?";
  const params = [jobId];
  if (status) {
    sql += " AND status = ?";
    params.push(status);
  }
  sql += " ORDER BY rowid ASC LIMIT ? OFFSET ?";
  params.push(parseInt(limit) || 200, parseInt(offset) || 0);

  const rows = getKbDb().prepare(sql).all(...params);
  const candidates = rows.map(buildCandidateResponse);

  const total = getKbDb().prepare(
    "SELECT COUNT(*) AS c FROM kb_seeding_candidates WHERE job_id = ?" +
    (status ? " AND status = ?" : "")
  ).get(...(status ? [jobId, status] : [jobId])).c;

  return res.json({
    candidates,
    total,
    limit: parseInt(limit) || 200,
    offset: parseInt(offset) || 0,
  });
});

// GET /api/kb/seeding/candidates/:candId — Get a single candidate
router.get("/candidates/:candId", requireAuth, (req, res) => {
  const row = getKbDb()
    .prepare("SELECT * FROM kb_seeding_candidates WHERE candidate_id = ?")
    .get(req.params.candId);
  if (!row) return res.status(404).json({ error: "Candidate not found" });
  return res.json(buildCandidateResponse(row));
});

// GET /api/kb/seeding/jobs/:jobId/candidates/:candId/image — Serve image preview
// Used during review to display the image attached to an image candidate.
// Returns the raw image bytes with the candidate's media_type. The jobId
// in the URL is verified against the candidate's job_id as defense in depth.
router.get(
  "/jobs/:jobId/candidates/:candId/image",
  requireAuth,
  (req, res) => {
    const { jobId, candId } = req.params;
    const candidate = getKbDb()
      .prepare(
        "SELECT job_id, media_type, image_file " +
        "FROM kb_seeding_candidates WHERE candidate_id = ?"
      )
      .get(candId);

    if (!candidate) {
      return res.status(404).json({ error: "Candidate not found" });
    }
    if (candidate.job_id !== jobId) {
      return res.status(404).json({ error: "Candidate not found in this job" });
    }
    if (!candidate.image_file || !candidate.media_type) {
      return res.status(404).json({ error: "Candidate has no attached image" });
    }

    const buf = readSeedingImage(jobId, candidate.image_file);
    if (!buf) {
      return res.status(404).json({ error: "Image file not found" });
    }

    res.set("Content-Type", candidate.media_type);
    res.set("Cache-Control", "private, max-age=300");
    res.send(buf);
  }
);

// PATCH /api/kb/seeding/candidates/:candId — Edit a candidate during review
router.patch(
  "/candidates/:candId",
  requireRole("Admin", "QA Manager"),
  (req, res) => {
    const { candId } = req.params;
    const db = getKbDb();
    const candidate = db
      .prepare("SELECT * FROM kb_seeding_candidates WHERE candidate_id = ?")
      .get(candId);

    if (!candidate) return res.status(404).json({ error: "Candidate not found" });
    if (candidate.status !== "pending_review") {
      return res.status(409).json({
        error: `Candidate is ${candidate.status}; cannot edit`,
      });
    }

    const {
      title, type, content,
      suggested_tags, subsection_id, pinned,
      related_reqs,
    } = req.body;

    // Validate type
    const VALID_TYPES = [
      "Defect History", "System Behavior", "Environment Constraint",
      "Business Rule", "Test Data Guideline",
    ];
    if (type !== undefined && !VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: `Invalid type: ${type}` });
    }

    // Validate subsection
    if (subsection_id !== undefined && subsection_id !== null) {
      const sub = db
        .prepare("SELECT 1 FROM kb_subsections WHERE subsection_id = ?")
        .get(subsection_id);
      if (!sub) return res.status(400).json({ error: "Invalid subsection_id" });
    }

    const txn = db.transaction(() => {
      // Apply candidate field updates
      const updates = [];
      const params = [];
      if (title !== undefined)          { updates.push("title = ?");          params.push(title); }
      if (type !== undefined)           { updates.push("type = ?");           params.push(type); }
      if (content !== undefined)        { updates.push("content = ?");        params.push(content); }
      if (suggested_tags !== undefined) { updates.push("suggested_tags = ?"); params.push(JSON.stringify(suggested_tags)); }
      if (subsection_id !== undefined)  { updates.push("subsection_id = ?");  params.push(subsection_id); }
      if (pinned !== undefined)         { updates.push("pinned = ?");         params.push(pinned ? 1 : 0); }

      if (updates.length > 0) {
        params.push(candId);
        db.prepare(
          `UPDATE kb_seeding_candidates SET ${updates.join(", ")} WHERE candidate_id = ?`
        ).run(...params);
      }

      // Reconcile xref matches if related_reqs provided
      if (Array.isArray(related_reqs)) {
        const existing = db.prepare(
          "SELECT match_id, req_id, user_decision FROM kb_seeding_xref_matches WHERE candidate_id = ?"
        ).all(candId);
        const existingByReq = Object.fromEntries(existing.map(m => [m.req_id, m]));
        const newSet = new Set(related_reqs);

        // For each existing match, keep or mark removed
        for (const m of existing) {
          if (newSet.has(m.req_id)) {
            if (m.user_decision !== "kept" && m.user_decision !== "manually_added") {
              db.prepare(
                "UPDATE kb_seeding_xref_matches SET user_decision = 'kept' WHERE match_id = ?"
              ).run(m.match_id);
            }
          } else if (m.user_decision !== "removed") {
            db.prepare(
              "UPDATE kb_seeding_xref_matches SET user_decision = 'removed' WHERE match_id = ?"
            ).run(m.match_id);
          }
        }

        // Insert manually-added matches
        for (const reqId of related_reqs) {
          if (!existingByReq[reqId]) {
            db.prepare(`
              INSERT INTO kb_seeding_xref_matches
                (candidate_id, req_id, confidence, justification, auto_applied, user_decision)
              VALUES (?, ?, NULL, NULL, 0, 'manually_added')
            `).run(candId, reqId);
          }
        }
      }
    });
    txn();

    const updated = db
      .prepare("SELECT * FROM kb_seeding_candidates WHERE candidate_id = ?")
      .get(candId);
    return res.json(buildCandidateResponse(updated));
  }
);

// Helper: compute user_edits diff between original and current values
function computeUserEdits(candidate) {
  const original = safeJson(candidate.original_extracted, null);
  if (!original) return null;

  const diff = {};
  const currentTags = safeJson(candidate.suggested_tags, []);
  const originalTags = original.suggested_tags || [];

  if (candidate.title !== original.title) diff.title = { from: original.title, to: candidate.title };
  if (candidate.type !== original.type) diff.type = { from: original.type, to: candidate.type };
  if (candidate.content !== original.content) diff.content = { from: original.content, to: candidate.content };
  if (JSON.stringify(currentTags) !== JSON.stringify(originalTags)) {
    diff.suggested_tags = { from: originalTags, to: currentTags };
  }
  return Object.keys(diff).length > 0 ? diff : null;
}

// Helper: build kb_entries row from an accepted candidate.
// Reads xref matches and writes related_reqs.
function acceptCandidateInTransaction(candId, userName) {
  const db = getKbDb();
  const candidate = db
    .prepare("SELECT * FROM kb_seeding_candidates WHERE candidate_id = ?")
    .get(candId);
  if (!candidate) throw new Error(`Candidate ${candId} not found`);
  if (candidate.status !== "pending_review") {
    throw new Error(`Candidate ${candId} is ${candidate.status}, cannot accept`);
  }

  // Pull kept + manually-added req IDs for related_reqs
  const matches = db.prepare(`
    SELECT req_id FROM kb_seeding_xref_matches
    WHERE candidate_id = ? AND user_decision IN ('kept', 'manually_added')
  `).all(candId);
  const relatedReqs = matches.map(m => m.req_id);

  // Generate next kb_id (matches existing nextKbId pattern)
  const kbCount = db.prepare("SELECT COUNT(*) AS c FROM kb_entries").get().c;
  const kbId = `KB-E${String(kbCount + 1).padStart(3, "0")}`;

  // Diff-based user_edits + final status
  const userEdits = computeUserEdits(candidate);
  const finalStatus = userEdits ? "edited_accepted" : "accepted";

  // If the candidate has an attached image, move it into the kb entry's
  // image directory and build the images JSON. The seeding image is
  // deleted by the caller after the transaction commits (see the
  // returned `seedingImageToCleanup` field).
  let imagesJson = "[]";
  if (candidate.media_type && candidate.image_file) {
    const base64Data = readSeedingImageBase64(
      candidate.job_id, candidate.image_file
    );
    if (!base64Data) {
      throw new Error(
        `Seeding image missing for candidate ${candId}: ${candidate.image_file}`
      );
    }
    const savedName = saveImage(kbId, candidate.image_file, base64Data);
    imagesJson = JSON.stringify([{
      name: savedName,
      media_type: candidate.media_type,
      description: candidate.content,
    }]);
  }

  // Insert kb_entry
  db.prepare(`
    INSERT INTO kb_entries
      (kb_id, title, type, content, tags, related_reqs, images,
       subsection_id, pinned, created_by,
       source, source_url, source_ref)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seeded', ?, ?)
  `).run(
    kbId,
    candidate.title,
    candidate.type,
    candidate.content,
    candidate.suggested_tags || "[]",
    JSON.stringify(relatedReqs),
    imagesJson,
    candidate.subsection_id,
    candidate.pinned,
    `${userName} (seeded from ${candidate.job_id})`,
    candidate.source_url,
    JSON.stringify({ job_id: candidate.job_id, candidate_id: candId })
  );

  // Update candidate
  db.prepare(`
    UPDATE kb_seeding_candidates
    SET status = ?,
        final_kb_id = ?,
        user_edits = ?,
        reviewed_at = ?,
        reviewed_by = ?
    WHERE candidate_id = ?
  `).run(
    finalStatus,
    kbId,
    userEdits ? JSON.stringify(userEdits) : null,
    new Date().toISOString(),
    userName,
    candId
  );

  return {
    kbId,
    finalStatus,
    relatedReqs,
    seedingImageToCleanup: (candidate.media_type && candidate.image_file)
      ? { jobId: candidate.job_id, fileName: candidate.image_file }
      : null,
  };
}

// POST /api/kb/seeding/candidates/:candId/accept — Accept a candidate
router.post(
  "/candidates/:candId/accept",
  requireRole("Admin", "QA Manager"),
  (req, res) => {
    const { candId } = req.params;
    const db = getKbDb();

    try {
      const txn = db.transaction(() => acceptCandidateInTransaction(candId, req.session.name));
      const result = txn();

      // Best-effort cleanup of the seeding image after successful commit.
      // If this fails, the file will get swept up at finalize anyway.
      if (result.seedingImageToCleanup) {
        try {
          deleteSeedingImage(
            result.seedingImageToCleanup.jobId,
            result.seedingImageToCleanup.fileName
          );
        } catch { /* non-critical */ }
      }

      logAudit(
        req.session.name,
        "KB_SEEDED_ACCEPTED",
        `Accepted ${candId} → ${result.kbId} (${result.finalStatus}, ${result.relatedReqs.length} req links)`
      );

      const updated = db
        .prepare("SELECT * FROM kb_seeding_candidates WHERE candidate_id = ?")
        .get(candId);
      return res.json(buildCandidateResponse(updated));
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }
);

// POST /api/kb/seeding/candidates/:candId/reject — Reject a candidate
router.post(
  "/candidates/:candId/reject",
  requireRole("Admin", "QA Manager"),
  (req, res) => {
    const { candId } = req.params;
    const db = getKbDb();
    const candidate = db
      .prepare("SELECT * FROM kb_seeding_candidates WHERE candidate_id = ?")
      .get(candId);

    if (!candidate) return res.status(404).json({ error: "Candidate not found" });
    if (candidate.status !== "pending_review") {
      return res.status(409).json({
        error: `Candidate is ${candidate.status}, cannot reject`,
      });
    }

    db.prepare(`
      UPDATE kb_seeding_candidates
      SET status = 'rejected',
          reviewed_at = ?,
          reviewed_by = ?
      WHERE candidate_id = ?
    `).run(new Date().toISOString(), req.session.name, candId);

    // Clean up the seeding image for rejected image candidates
    if (candidate.image_file) {
      try { deleteSeedingImage(candidate.job_id, candidate.image_file); }
      catch { /* non-critical, swept up at finalize */ }
    }

    return res.json(buildCandidateResponse(
      db.prepare("SELECT * FROM kb_seeding_candidates WHERE candidate_id = ?").get(candId)
    ));
  }
);

// ════════════════════════════════════════════════════════════════════════════
// BULK ACTIONS
// ════════════════════════════════════════════════════════════════════════════

// POST /api/kb/seeding/candidates/bulk-accept — Accept many candidates
router.post(
  "/candidates/bulk-accept",
  requireRole("Admin", "QA Manager"),
  (req, res) => {
    const { candidate_ids } = req.body;
    if (!Array.isArray(candidate_ids) || candidate_ids.length === 0) {
      return res.status(400).json({ error: "candidate_ids must be a non-empty array" });
    }

    const db = getKbDb();
    const created_kb_ids = [];
    const errors = [];
    const seedingImagesToCleanup = [];
    let skipped = 0;

    const txn = db.transaction(() => {
      for (const candId of candidate_ids) {
        try {
          const result = acceptCandidateInTransaction(candId, req.session.name);
          created_kb_ids.push(result.kbId);
          if (result.seedingImageToCleanup) {
            seedingImagesToCleanup.push(result.seedingImageToCleanup);
          }
        } catch (err) {
          // Skipping is acceptable — don't fail the batch
          if (err.message.includes("cannot accept")) {
            skipped++;
          } else {
            errors.push({ candidate_id: candId, error: err.message });
          }
        }
      }
    });
    txn();

    // Best-effort cleanup of seeding images after successful commit
    for (const cleanup of seedingImagesToCleanup) {
      try { deleteSeedingImage(cleanup.jobId, cleanup.fileName); }
      catch { /* non-critical */ }
    }

    logAudit(
      req.session.name,
      "KB_SEEDING_BULK_ACCEPT",
      `Bulk accept: ${created_kb_ids.length} accepted, ${skipped} skipped, ${errors.length} errors`
    );

    return res.json({
      ok: true,
      processed: created_kb_ids.length,
      skipped,
      created_kb_ids,
      errors,
    });
  }
);

// POST /api/kb/seeding/candidates/bulk-reject — Reject many candidates
router.post(
  "/candidates/bulk-reject",
  requireRole("Admin", "QA Manager"),
  (req, res) => {
    const { candidate_ids } = req.body;
    if (!Array.isArray(candidate_ids) || candidate_ids.length === 0) {
      return res.status(400).json({ error: "candidate_ids must be a non-empty array" });
    }

    const db = getKbDb();
    const now = new Date().toISOString();
    const reviewer = req.session.name;
    let processed = 0;
    let skipped = 0;

    const seedingImagesToCleanup = [];
    const txn = db.transaction(() => {
      for (const candId of candidate_ids) {
        // Capture image info before update so we know what to clean up
        const candidate = db
          .prepare("SELECT job_id, image_file FROM kb_seeding_candidates WHERE candidate_id = ?")
          .get(candId);

        const result = db.prepare(`
          UPDATE kb_seeding_candidates
          SET status = 'rejected',
              reviewed_at = ?,
              reviewed_by = ?
          WHERE candidate_id = ? AND status = 'pending_review'
        `).run(now, reviewer, candId);

        if (result.changes === 1) {
          processed++;
          if (candidate?.image_file) {
            seedingImagesToCleanup.push({
              jobId: candidate.job_id,
              fileName: candidate.image_file,
            });
          }
        } else {
          skipped++;
        }
      }
    });
    txn();

    // Best-effort cleanup after commit
    for (const cleanup of seedingImagesToCleanup) {
      try { deleteSeedingImage(cleanup.jobId, cleanup.fileName); }
      catch { /* non-critical */ }
    }

    logAudit(
      req.session.name,
      "KB_SEEDING_BULK_REJECT",
      `Bulk reject: ${processed} rejected, ${skipped} skipped`
    );

    return res.json({ ok: true, processed, skipped });
  }
);

module.exports = router;
