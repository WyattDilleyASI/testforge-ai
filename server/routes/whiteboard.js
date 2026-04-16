// ─── WHITEBOARD ROUTES ──────────────────────────────────────────────────────
// Shared drawing canvas — strokes persist in core.db so all users
// on the Whiteboard theme see the same board.

const express = require("express");
const router = express.Router();
const { getCoreDb, logAudit } = require("../db");

// Auth middleware (same pattern as other routes)
function requireAuth(req, res, next) {
  if (!req.session?.userId) return res.status(401).json({ error: "Not authenticated" });
  next();
}

// GET /api/whiteboard — fetch all strokes in creation order
router.get("/", requireAuth, (req, res) => {
  const rows = getCoreDb()
    .prepare("SELECT id, points, color, width, eraser, created_by, created_at FROM whiteboard_strokes ORDER BY id")
    .all();

  res.json(rows.map(r => ({
    ...r,
    points: JSON.parse(r.points),
    eraser: !!r.eraser,
  })));
});

// POST /api/whiteboard/stroke — save a new stroke (or eraser stroke)
router.post("/stroke", requireAuth, (req, res) => {
  const { points, color, width, eraser } = req.body;

  if (!points || !Array.isArray(points) || points.length === 0) {
    return res.status(400).json({ error: "Points array is required" });
  }

  const result = getCoreDb()
    .prepare("INSERT INTO whiteboard_strokes (points, color, width, eraser, created_by) VALUES (?, ?, ?, ?, ?)")
    .run(
      JSON.stringify(points),
      color || "#D02020",
      width || 5,
      eraser ? 1 : 0,
      req.session.name || "Unknown"
    );

  res.json({ ok: true, id: result.lastInsertRowid });
});

// DELETE /api/whiteboard/clear — wipe the entire board
router.delete("/clear", requireAuth, (req, res) => {
  getCoreDb().prepare("DELETE FROM whiteboard_strokes").run();
  logAudit(req.session.name || "Unknown", "WHITEBOARD_CLEARED", "Whiteboard cleared by user");
  res.json({ ok: true });
});

// GET /api/whiteboard/count — lightweight poll endpoint (just returns row count)
router.get("/count", requireAuth, (req, res) => {
  const row = getCoreDb().prepare("SELECT COUNT(*) as count FROM whiteboard_strokes").get();
  res.json({ count: row.count });
});

module.exports = router;
