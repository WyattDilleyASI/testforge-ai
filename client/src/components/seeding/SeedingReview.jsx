// ═══════════════════════════════════════════════════════════════════════════
// SeedingReview — Step 3 of the wizard
// ═══════════════════════════════════════════════════════════════════════════
//
// The meaty interaction screen. Loads candidates for a job, lets the user
// edit / accept / reject them individually or in bulk, then finalize the
// job. Once finalized, the same view renders as a read-only audit view
// (with the option to peek at rejected entries).

import { useState, useEffect, useMemo, useCallback } from "react";
import { useTheme, mono } from "../../theme";
import { Card, Button } from "../shared";
import { seedingApi, KB_TYPE_CODES, KB_TYPE_COLORS } from "../../api-seeding";
import { CandidateCard } from "./CandidateCard";

const KB_TYPES = [
  "Defect History",
  "System Behavior",
  "Environment Constraint",
  "Business Rule",
  "Test Data Guideline",
];

export const SeedingReview = ({ job, onRefreshJob, onBack }) => {
  const COLORS = useTheme();
  const [candidates, setCandidates] = useState([]);
  const [requirements, setRequirements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [typeFilter, setTypeFilter] = useState("all");
  const [showRejected, setShowRejected] = useState(job.status !== "completed");
  const [finalizing, setFinalizing] = useState(false);
  const [confirmFinalize, setConfirmFinalize] = useState(false);

  const isCompleted = job.status === "completed";
  const isReadOnly = isCompleted;

  // ─── Data loading ──────────────────────────────────────────────────────
  const refreshCandidates = useCallback(async () => {
    try {
      const data = await seedingApi.listCandidates(job.job_id, { limit: 500 });
      setCandidates(data.candidates || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [job.job_id]);

  useEffect(() => {
    refreshCandidates();
  }, [refreshCandidates]);

  // Load requirements once for manual-add UI inside expanded cards
  useEffect(() => {
    // The existing TestForge api should have something like api.getRequirements();
    // if the method name differs, swap below or pass requirements in from parent.
    import("../../api").then(({ api }) => {
      if (typeof api?.getRequirements === "function") {
        api.getRequirements().then(setRequirements).catch(() => setRequirements([]));
      }
    });
  }, []);

  // ─── Derived state ─────────────────────────────────────────────────────
  const visibleCandidates = useMemo(() => {
    return candidates.filter((c) => {
      if (typeFilter !== "all" && c.type !== typeFilter) return false;
      if (!showRejected && c.status === "rejected") return false;
      return true;
    });
  }, [candidates, typeFilter, showRejected]);

  const groupedByType = useMemo(() => {
    const groups = new Map();
    for (const type of KB_TYPES) groups.set(type, []);
    for (const cand of visibleCandidates) {
      if (!groups.has(cand.type)) groups.set(cand.type, []);
      groups.get(cand.type).push(cand);
    }
    // Sort each group: pending first, then by confidence desc, then accepted, then rejected
    for (const [, list] of groups) {
      list.sort((a, b) => {
        const statusOrder = { pending_review: 0, accepted: 1, edited_accepted: 1, rejected: 2 };
        const sa = statusOrder[a.status] ?? 3;
        const sb = statusOrder[b.status] ?? 3;
        if (sa !== sb) return sa - sb;
        return (b.extraction_confidence || 0) - (a.extraction_confidence || 0);
      });
    }
    return groups;
  }, [visibleCandidates]);

  const typeCounts = useMemo(() => {
    const counts = { all: 0 };
    for (const type of KB_TYPES) counts[type] = 0;
    for (const c of candidates) {
      if (!showRejected && c.status === "rejected") continue;
      counts.all += 1;
      counts[c.type] = (counts[c.type] || 0) + 1;
    }
    return counts;
  }, [candidates, showRejected]);

  const pendingCount = candidates.filter((c) => c.status === "pending_review").length;
  const acceptedCount = candidates.filter(
    (c) => c.status === "accepted" || c.status === "edited_accepted"
  ).length;
  const rejectedCount = candidates.filter((c) => c.status === "rejected").length;

  // Only pending candidates can be selected for bulk actions
  const selectablePending = useMemo(
    () => visibleCandidates.filter((c) => c.status === "pending_review"),
    [visibleCandidates]
  );

  // ─── Selection helpers ─────────────────────────────────────────────────
  const toggleSelect = (candId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(candId)) next.delete(candId);
      else next.add(candId);
      return next;
    });
  };

  const toggleExpand = (candId) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(candId)) next.delete(candId);
      else next.add(candId);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedIds(new Set(selectablePending.map((c) => c.candidate_id)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  // ─── Action handlers ───────────────────────────────────────────────────
  const handleAccept = async (candId) => {
    try {
      await seedingApi.acceptCandidate(candId);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(candId);
        return next;
      });
      await refreshCandidates();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleReject = async (candId) => {
    try {
      await seedingApi.rejectCandidate(candId);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(candId);
        return next;
      });
      await refreshCandidates();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleEdit = async (candId, updates) => {
    try {
      await seedingApi.updateCandidate(candId, updates);
      await refreshCandidates();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleBulkAccept = async () => {
    if (selectedIds.size === 0) return;
    try {
      await seedingApi.bulkAccept([...selectedIds]);
      clearSelection();
      await refreshCandidates();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleBulkReject = async () => {
    if (selectedIds.size === 0) return;
    try {
      await seedingApi.bulkReject([...selectedIds]);
      clearSelection();
      await refreshCandidates();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSectionAccept = async (type) => {
    const ids = (groupedByType.get(type) || [])
      .filter((c) => c.status === "pending_review")
      .map((c) => c.candidate_id);
    if (ids.length === 0) return;
    try {
      await seedingApi.bulkAccept(ids);
      await refreshCandidates();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSectionReject = async (type) => {
    const ids = (groupedByType.get(type) || [])
      .filter((c) => c.status === "pending_review")
      .map((c) => c.candidate_id);
    if (ids.length === 0) return;
    try {
      await seedingApi.bulkReject(ids);
      await refreshCandidates();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleFinalize = async () => {
    setFinalizing(true);
    try {
      await seedingApi.finalizeJob(job.job_id);
      setConfirmFinalize(false);
      await onRefreshJob();
      await refreshCandidates();
    } catch (err) {
      setError(err.message);
      setFinalizing(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={onBack}
            style={{
              background: "transparent", border: "none", color: COLORS.textMuted,
              cursor: "pointer", fontSize: 12, padding: 4, fontFamily: mono,
            }}
          >
            ← Back
          </button>
          <div>
            <div style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: mono, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Knowledge Base ▸ Seeding ▸ {job.job_id}
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textBright, margin: "4px 0 0" }}>
              {isCompleted ? "Finalized seeding job" : "Review extracted candidates"}
            </h2>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontSize: 11, color: COLORS.textMuted, fontFamily: mono,
            padding: "6px 10px", background: COLORS.surface, borderRadius: 4,
          }}>
            {candidates.length} total · {pendingCount} pending · {acceptedCount} accepted · {rejectedCount} rejected
          </span>
        </div>
      </div>

      {error && (
        <Card style={{ marginBottom: 16, padding: 12, borderColor: "#E24B4A" }}>
          <div style={{ fontSize: 12, color: "#E24B4A" }}>{error}</div>
        </Card>
      )}

      {/* Filter tabs */}
      <Card style={{ padding: "8px 12px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <FilterTab
            active={typeFilter === "all"}
            onClick={() => setTypeFilter("all")}
            COLORS={COLORS}
            label={`All (${typeCounts.all})`}
          />
          {KB_TYPES.map((type) => (
            <FilterTab
              key={type}
              active={typeFilter === type}
              onClick={() => setTypeFilter(type)}
              COLORS={COLORS}
              label={`${KB_TYPE_CODES[type]} (${typeCounts[type] || 0})`}
              typeColor={KB_TYPE_COLORS[type]}
            />
          ))}
          <div style={{ flex: 1 }} />
          {isCompleted && (
            <label style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: mono, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                checked={showRejected}
                onChange={(e) => setShowRejected(e.target.checked)}
                style={{ margin: 0 }}
              />
              Show rejected ({rejectedCount})
            </label>
          )}
        </div>
      </Card>

      {/* Body — grouped candidate sections */}
      {loading && (
        <Card style={{ padding: 32, textAlign: "center", color: COLORS.textMuted }}>
          Loading candidates…
        </Card>
      )}

      {!loading && candidates.length === 0 && (
        <Card style={{ padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 14, color: COLORS.textBright, marginBottom: 6 }}>
            No candidates were extracted
          </div>
          <div style={{ fontSize: 12, color: COLORS.textMuted }}>
            Claude found no testable knowledge in the input. Try a different source.
          </div>
        </Card>
      )}

      {!loading && candidates.length > 0 && KB_TYPES.map((type) => {
        const list = groupedByType.get(type) || [];
        if (list.length === 0) return null;
        if (typeFilter !== "all" && typeFilter !== type) return null;

        const pendingInSection = list.filter((c) => c.status === "pending_review").length;

        return (
          <div key={type} style={{ marginBottom: 24 }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginBottom: 8, padding: "0 4px",
            }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: COLORS.textMuted,
                fontFamily: mono, textTransform: "uppercase", letterSpacing: "0.06em",
              }}>
                <span style={{
                  background: KB_TYPE_COLORS[type].bg, color: KB_TYPE_COLORS[type].fg,
                  padding: "2px 6px", borderRadius: 3, marginRight: 8,
                }}>
                  {KB_TYPE_CODES[type]}
                </span>
                {type} · {list.length} candidate{list.length !== 1 ? "s" : ""}
              </div>
              {!isReadOnly && pendingInSection > 0 && (
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={() => handleSectionAccept(type)}
                    style={miniButton(COLORS)}
                  >
                    Accept all {pendingInSection}
                  </button>
                  <button
                    onClick={() => handleSectionReject(type)}
                    style={miniButton(COLORS)}
                  >
                    Reject all {pendingInSection}
                  </button>
                </div>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {list.map((cand) => (
                <CandidateCard
                  key={cand.candidate_id}
                  candidate={cand}
                  expanded={expandedIds.has(cand.candidate_id)}
                  selected={selectedIds.has(cand.candidate_id)}
                  readOnly={isReadOnly}
                  requirements={requirements}
                  onToggleExpand={() => toggleExpand(cand.candidate_id)}
                  onToggleSelect={() => toggleSelect(cand.candidate_id)}
                  onAccept={() => handleAccept(cand.candidate_id)}
                  onReject={() => handleReject(cand.candidate_id)}
                  onEdit={(updates) => handleEdit(cand.candidate_id, updates)}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* Bottom action bar */}
      {!isReadOnly && (
        <div style={{
          position: "sticky", bottom: 0, marginTop: 24, padding: "12px 16px",
          background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 6,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ fontSize: 12, color: COLORS.textMuted, fontFamily: mono }}>
            {selectedIds.size > 0 ? (
              <>
                {selectedIds.size} selected ·{" "}
                <button
                  onClick={selectAllVisible}
                  style={{ background: "transparent", border: "none", color: COLORS.accent, cursor: "pointer", fontFamily: mono, fontSize: 12, padding: 0 }}
                >
                  select all visible ({selectablePending.length})
                </button>
                {" · "}
                <button
                  onClick={clearSelection}
                  style={{ background: "transparent", border: "none", color: COLORS.accent, cursor: "pointer", fontFamily: mono, fontSize: 12, padding: 0 }}
                >
                  clear
                </button>
              </>
            ) : (
              <>
                Select candidates to bulk-act ·{" "}
                <button
                  onClick={selectAllVisible}
                  style={{ background: "transparent", border: "none", color: COLORS.accent, cursor: "pointer", fontFamily: mono, fontSize: 12, padding: 0 }}
                >
                  select all visible ({selectablePending.length})
                </button>
              </>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button onClick={handleBulkAccept} disabled={selectedIds.size === 0}>
              Accept selected
            </Button>
            <Button onClick={handleBulkReject} disabled={selectedIds.size === 0}>
              Reject selected
            </Button>
            <Button
              onClick={() => setConfirmFinalize(true)}
              disabled={pendingCount === 0 && acceptedCount === 0 && rejectedCount === 0}
            >
              Finalize job →
            </Button>
          </div>
        </div>
      )}

      {/* Finalize confirmation modal */}
      {confirmFinalize && (
        <FinalizeModal
          pendingCount={pendingCount}
          acceptedCount={acceptedCount}
          rejectedCount={rejectedCount}
          finalizing={finalizing}
          onCancel={() => setConfirmFinalize(false)}
          onConfirm={handleFinalize}
          COLORS={COLORS}
        />
      )}
    </div>
  );
};

// ─── Filter tab ─────────────────────────────────────────────────────────────
const FilterTab = ({ active, onClick, COLORS, label, typeColor }) => (
  <button
    onClick={onClick}
    style={{
      padding: "4px 10px", fontSize: 12, fontFamily: mono,
      background: active
        ? (typeColor ? typeColor.bg : COLORS.accentDim || "transparent")
        : "transparent",
      color: active
        ? (typeColor ? typeColor.fg : COLORS.accent)
        : COLORS.textMuted,
      border: `1px solid ${active
        ? (typeColor ? typeColor.fg : COLORS.accent)
        : COLORS.border}`,
      borderRadius: 4, cursor: "pointer", fontWeight: active ? 600 : 400,
    }}
  >
    {label}
  </button>
);

const miniButton = (COLORS) => ({
  padding: "3px 10px", fontSize: 11, fontFamily: mono,
  background: "transparent", color: COLORS.textMuted,
  border: `1px solid ${COLORS.border}`, borderRadius: 4,
  cursor: "pointer",
});

// ─── Finalize confirmation modal ────────────────────────────────────────────
const FinalizeModal = ({ pendingCount, acceptedCount, rejectedCount, finalizing, onCancel, onConfirm, COLORS }) => (
  <div style={{
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
  }}>
    <Card style={{ padding: 24, maxWidth: 440, width: "90%", background: COLORS.background || COLORS.surface }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: COLORS.textBright, margin: 0, marginBottom: 12 }}>
        Finalize seeding job?
      </h3>
      <div style={{ fontSize: 13, color: COLORS.text, marginBottom: 16, lineHeight: 1.6 }}>
        Finalizing closes this job and computes its summary stats.
        Accepted entries are already in the KB.
        {pendingCount > 0 && (
          <span style={{ color: "#E24B4A" }}>
            {" "}<strong>{pendingCount} pending candidates will be auto-rejected.</strong>
          </span>
        )}
      </div>

      <div style={{ background: COLORS.surface, borderRadius: 6, padding: 12, marginBottom: 16, fontSize: 12, fontFamily: mono }}>
        <Row label="Accepted" value={acceptedCount} COLORS={COLORS} />
        <Row label="Rejected" value={rejectedCount} COLORS={COLORS} />
        <Row label="Pending → will be auto-rejected" value={pendingCount} COLORS={COLORS} />
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button onClick={onCancel} disabled={finalizing}>Cancel</Button>
        <Button onClick={onConfirm} disabled={finalizing}>
          {finalizing ? "Finalizing…" : "Finalize job"}
        </Button>
      </div>
    </Card>
  </div>
);

const Row = ({ label, value, COLORS }) => (
  <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
    <span style={{ color: COLORS.textMuted }}>{label}</span>
    <span style={{ color: COLORS.textBright, fontWeight: 600 }}>{value}</span>
  </div>
);
