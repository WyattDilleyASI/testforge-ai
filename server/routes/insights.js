const express = require("express");
const { requireMobileAuth } = require("../auth");
const { getOrComputeInsight } = require("../insights");

const router = express.Router();

// GET /api/insights/coverage-gaps — all authenticated users (web + mobile)
router.get("/coverage-gaps", requireMobileAuth, async (req, res) => {
  try {
    res.json(await getOrComputeInsight());
  } catch (err) {
    console.error("[Insights] GET error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/insights/coverage-gaps/refresh — Admin / QA Manager only
router.post("/coverage-gaps/refresh", requireMobileAuth, async (req, res) => {
  const role = req.mobileUser?.role || req.session?.role;
  if (role !== "Admin" && role !== "QA Manager") {
    return res.status(403).json({ error: "Requires role: Admin or QA Manager" });
  }
  try {
    res.json(await getOrComputeInsight({ force: true }));
  } catch (err) {
    console.error("[Insights] Refresh error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
