const express = require("express");
const { requireAuth, requireRole } = require("../auth");
const { getOrComputeInsight } = require("../insights");

const router = express.Router();

// GET /api/insights/coverage-gaps — all authenticated users
router.get("/coverage-gaps", requireAuth, async (req, res) => {
  try {
    res.json(await getOrComputeInsight());
  } catch (err) {
    console.error("[Insights] GET error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/insights/coverage-gaps/refresh — Admin / QA Manager only
router.post("/coverage-gaps/refresh", requireRole("Admin", "QA Manager"), async (req, res) => {
  try {
    res.json(await getOrComputeInsight({ force: true }));
  } catch (err) {
    console.error("[Insights] Refresh error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
