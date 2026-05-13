// ═══════════════════════════════════════════════════════════════════════════
// SeedingView — top-level container for the KB Seeding Wizard
// ═══════════════════════════════════════════════════════════════════════════
//
// Owns the three lifecycle states:
//   1. List of recent jobs (default landing)
//   2. Upload form (new job creation)
//   3. Active job — routes to processing or review based on job.status
//
// Polls the current job every 10 seconds while in 'extracting' or
// 'cross_referencing' state. The backend's opportunistic-sync pattern
// means each GET advances the state machine, so we just keep asking.

import { useState, useEffect, useCallback } from "react";
import { useTheme, mono } from "../theme";
import { Card, Button } from "../components/shared";
import { seedingApi } from "../api-seeding";

import { SeedingUploadForm } from "../components/seeding/SeedingUploadForm";
import { SeedingProcessing } from "../components/seeding/SeedingProcessing";
import { SeedingReview }     from "../components/seeding/SeedingReview";

const POLL_INTERVAL_MS = 10000;

const STATUS_LABELS = {
  extracting:        "Extracting",
  cross_referencing: "Cross-referencing",
  review:            "Ready to review",
  completed:         "Completed",
  failed:            "Failed",
};

const STATUS_COLORS = (COLORS) => ({
  extracting:        { fg: COLORS.amber,  bg: COLORS.amberDim  || "transparent" },
  cross_referencing: { fg: COLORS.amber,  bg: COLORS.amberDim  || "transparent" },
  review:            { fg: COLORS.accent, bg: COLORS.accentDim || "transparent" },
  completed:         { fg: COLORS.green,  bg: COLORS.greenDim  || "transparent" },
  failed:            { fg: "#E24B4A",     bg: "#FCEBEB" },
});

export const SeedingView = ({ currentUser, embedded = false }) => {
  const COLORS = useTheme();
  const [view, setView] = useState("list");        // 'list' | 'upload' | 'job'
  const [currentJobId, setCurrentJobId] = useState(null);
  const [currentJob, setCurrentJob] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [error, setError] = useState(null);

  const isManager = currentUser?.role === "QA Manager" || currentUser?.role === "Admin";

  // ─── Load recent jobs when in list view ────────────────────────────────
  const refreshJobs = useCallback(async () => {
    setLoadingJobs(true);
    try {
      const data = await seedingApi.listJobs({ limit: 20 });
      setJobs(data.jobs || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  useEffect(() => {
    if (view === "list") refreshJobs();
  }, [view, refreshJobs]);

  // ─── Poll current job while it's active ────────────────────────────────
  useEffect(() => {
    if (view !== "job" || !currentJobId) return undefined;

    let cancelled = false;
    const poll = async () => {
      try {
        const job = await seedingApi.getJob(currentJobId);
        if (cancelled) return;
        setCurrentJob(job);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [view, currentJobId]);

  // ─── Permission gate ───────────────────────────────────────────────────
  if (!isManager) {
    return (
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textBright, margin: 0 }}>
          KB Seeding
        </h2>
        <Card style={{ marginTop: 16, padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 14, color: COLORS.textMuted }}>
            KB Seeding is available to QA Managers and Admins.
          </div>
        </Card>
      </div>
    );
  }

  // ─── Upload view ───────────────────────────────────────────────────────
  if (view === "upload") {
    return (
      <SeedingUploadForm
        onCancel={() => setView("list")}
        onCreated={(jobId) => {
          setCurrentJobId(jobId);
          setView("job");
        }}
      />
    );
  }

  // ─── Active job view ───────────────────────────────────────────────────
  if (view === "job") {
    if (!currentJob) {
      return (
        <div>
          <ViewHeader title="Loading job…" onBack={() => setView("list")} COLORS={COLORS} />
          <Card style={{ marginTop: 16, padding: 24, textAlign: "center", color: COLORS.textMuted }}>
            Fetching {currentJobId}…
          </Card>
        </div>
      );
    }

    const status = currentJob.status;
    if (status === "extracting" || status === "cross_referencing") {
      return (
        <SeedingProcessing
          job={currentJob}
          onCancel={async () => {
            try {
              await seedingApi.deleteJob(currentJob.job_id);
              setView("list");
              setCurrentJobId(null);
              setCurrentJob(null);
            } catch (err) {
              setError(err.message);
            }
          }}
          onBack={() => setView("list")}
        />
      );
    }

    if (status === "review" || status === "completed") {
      return (
        <SeedingReview
          job={currentJob}
          onRefreshJob={async () => {
            const refreshed = await seedingApi.getJob(currentJobId);
            setCurrentJob(refreshed);
          }}
          onBack={() => {
            setView("list");
            setCurrentJobId(null);
            setCurrentJob(null);
          }}
        />
      );
    }

    if (status === "failed") {
      return (
        <div>
          <ViewHeader
            title={`${currentJob.job_id} · Failed`}
            onBack={() => setView("list")}
            COLORS={COLORS}
          />
          <Card style={{ marginTop: 16, padding: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#E24B4A", marginBottom: 8 }}>
              This job failed.
            </div>
            <div style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 16 }}>
              {currentJob.error || "No error message available."}
            </div>
            <Button
              onClick={async () => {
                await seedingApi.deleteJob(currentJob.job_id);
                setView("list");
                setCurrentJobId(null);
                setCurrentJob(null);
              }}
            >
              Delete job
            </Button>
          </Card>
        </div>
      );
    }

    return null;
  }

  // ─── List view (default) ───────────────────────────────────────────────
  const statusColors = STATUS_COLORS(COLORS);
  return (
    <div>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 16,
      }}>
        {embedded ? (
          <div /> /* spacer — push the button to the right */
        ) : (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textBright, margin: 0 }}>
              KB Seeding
            </h2>
            <p style={{ fontSize: 12, color: COLORS.textMuted, margin: "4px 0 0", fontFamily: mono }}>
              Bulk-extract KB entries from source material via Claude
            </p>
          </div>
        )}
        <Button onClick={() => setView("upload")}>+ New seeding job</Button>
      </div>

      {error && (
        <Card style={{ marginBottom: 16, padding: 12, borderColor: "#E24B4A" }}>
          <div style={{ fontSize: 12, color: "#E24B4A" }}>{error}</div>
        </Card>
      )}

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{
          padding: "12px 16px",
          borderBottom: `1px solid ${COLORS.border}`,
          fontSize: 11, fontWeight: 700, color: COLORS.textMuted,
          fontFamily: mono, textTransform: "uppercase", letterSpacing: "0.06em",
        }}>
          Recent jobs ({jobs.length})
        </div>

        {loadingJobs && (
          <div style={{ padding: 24, textAlign: "center", fontSize: 12, color: COLORS.textMuted }}>
            Loading…
          </div>
        )}

        {!loadingJobs && jobs.length === 0 && (
          <div style={{ padding: 32, textAlign: "center" }}>
            <div style={{ fontSize: 14, color: COLORS.textBright, marginBottom: 6 }}>
              No seeding jobs yet
            </div>
            <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 16 }}>
              Start a new job to bulk-extract KB entries from pasted text or uploaded files.
            </div>
            <Button onClick={() => setView("upload")}>Start a seeding job</Button>
          </div>
        )}

        {!loadingJobs && jobs.map((job) => {
          const sColor = statusColors[job.status] || { fg: COLORS.text, bg: "transparent" };
          const created = new Date(job.created_at);
          const stats = job.stats;
          const counts = job.candidate_counts || {};

          return (
            <div
              key={job.job_id}
              onClick={() => {
                setCurrentJobId(job.job_id);
                setCurrentJob(job);
                setView("job");
              }}
              style={{
                padding: "12px 16px",
                borderBottom: `1px solid ${COLORS.border}`,
                cursor: "pointer",
                display: "grid",
                gridTemplateColumns: "120px 1fr 1fr 120px",
                gap: 16, alignItems: "center",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = COLORS.hover; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{
                fontFamily: mono, fontSize: 12, fontWeight: 600, color: COLORS.textBright,
              }}>
                {job.job_id}
              </span>
              <span style={{
                fontSize: 11, color: sColor.fg, background: sColor.bg,
                padding: "3px 8px", borderRadius: 4, fontFamily: mono,
                textTransform: "uppercase", letterSpacing: "0.04em",
                justifySelf: "start",
              }}>
                {STATUS_LABELS[job.status] || job.status}
              </span>
              <span style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: mono }}>
                {stats
                  ? `${(stats.accepted || 0) + (stats.edited_accepted || 0)} accepted · ${stats.rejected || 0} rejected`
                  : `${counts.pending_review || 0} pending · ${counts.accepted || 0} accepted`}
              </span>
              <span style={{
                fontSize: 11, color: COLORS.textMuted, fontFamily: mono, textAlign: "right",
              }}>
                {created.toLocaleDateString()} · {job.created_by}
              </span>
            </div>
          );
        })}
      </Card>
    </div>
  );
};

// ─── Shared header used by sub-views ────────────────────────────────────────
const ViewHeader = ({ title, onBack, COLORS, right }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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
      <h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textBright, margin: 0 }}>
        {title}
      </h2>
    </div>
    {right}
  </div>
);
