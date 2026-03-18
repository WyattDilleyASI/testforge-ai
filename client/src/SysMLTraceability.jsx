// ═══════════════════════════════════════════════════════════════
// SysMLTraceability.jsx
// Interactive SysML Requirements Diagram for TestForge AI
//
// Replaces the flat TraceabilityView table with a visual
// hierarchy diagram powered by D3.
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import * as d3 from "d3";

// ─── DATA TRANSFORMER ──────────────────────────────────────────

const JAMA_PREFIX_DEPTH = {
  "LFWM2-PRD_Rqmts-": 0,
  "LFWM2-SYSRQ-": 1,
  "LFWM2-SubSys_Rqmt-": 2,
  "LFWM2-CMPRQ-": 3,
};

function detectIdFormat(id) {
  if (!id) return "unknown";
  for (const prefix of Object.keys(JAMA_PREFIX_DEPTH)) {
    if (id.startsWith(prefix)) return "jama";
  }
  if (/^[A-Z]{2,6}-\d{2,3}(-\d{2,3})*$/.test(id)) return "fwm";
  if (/^[A-Za-z]+-\d+/.test(id)) return "fwm";
  return "unknown";
}

function getDepth(id) {
  const format = detectIdFormat(id);
  if (format === "jama") {
    for (const [prefix, depth] of Object.entries(JAMA_PREFIX_DEPTH)) {
      if (id.startsWith(prefix)) return depth;
    }
    return 0;
  }
  if (format === "fwm") {
    const segments = (id.match(/\d+/g) || []).length;
    return Math.min(Math.max(segments - 1, 0), 3);
  }
  return 0;
}

function resolveParent(req, allReqIds) {
  const id = req.req_id;
  const format = detectIdFormat(id);
  if (format === "fwm") {
    const parent = id.replace(/[-_.]\d+$/, "");
    if (parent !== id && allReqIds.has(parent)) return parent;
    return "";
  }
  if (format === "jama") {
    const myDepth = getDepth(id);
    const rels = req.relationships || [];
    for (const rel of rels) {
      if (rel.direction === "Upstream" && allReqIds.has(rel.id)) {
        if (getDepth(rel.id) === myDepth - 1) return rel.id;
      }
    }
    return "";
  }
  return "";
}

function mapJamaRelationshipType(rel, reqDepth) {
  const relDepth = getDepth(rel.id);
  if (rel.direction === "Upstream" && relDepth === reqDepth - 1) return null;
  if (rel.direction === "Upstream") return "deriveReqt";
  if (rel.direction === "Downstream") return "trace";
  return "trace";
}

function transformForDiagram(apiRequirements, apiTestCases = [], options = {}) {
  const { includeTestCases = false } = options;
  const allReqIds = new Set(apiRequirements.map((r) => r.req_id));

  const requirements = apiRequirements.map((req) => ({
    id: req.req_id,
    name: req.title || req.req_id,
    text: req.description || "",
    parent: resolveParent(req, allReqIds),
    _meta: {
      priority: req.priority, status: req.status,
      acceptance_criteria: req.acceptance_criteria || [],
      rationale: req.rationale || "", verification_method: req.verification_method || "",
      safety_level: req.safety_level || "", requirement_type: req.requirement_type || "",
      module: req.module || "", source: req.source || "", tags: req.tags || [],
    },
  }));

  const depths = {};
  requirements.forEach((r) => { depths[r.id] = getDepth(r.id); });

  const relationships = [];
  const allDiagramIds = new Set(requirements.map((r) => r.id));
  const edgeSet = new Set();

  for (const req of requirements) {
    if (req.parent && allDiagramIds.has(req.parent)) {
      relationships.push({ type: "containment", source: req.parent, target: req.id });
    }
  }

  for (const apiReq of apiRequirements) {
    const rels = apiReq.relationships || [];
    const reqDepth = getDepth(apiReq.req_id);
    for (const rel of rels) {
      if (!allReqIds.has(rel.id) || rel.id === apiReq.req_id) continue;
      const edgeType = mapJamaRelationshipType(rel, reqDepth);
      if (!edgeType) continue;
      const key = `${edgeType}:${apiReq.req_id}->${rel.id}`;
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      relationships.push({ type: edgeType, source: apiReq.req_id, target: rel.id });
    }
  }

  const orphans = new Set();
  for (const req of requirements) {
    if (depths[req.id] > 0 && !req.parent) orphans.add(req.id);
  }

  const tcNodes = [];
  let tcLinkCount = 0;
  if (includeTestCases && apiTestCases.length > 0) {
    for (const tc of apiTestCases) {
      const reqIds = tc.linked_req_ids || [];
      if (reqIds.length === 0) continue;
      tcNodes.push({
        id: tc.tc_id, name: tc.title || tc.tc_id,
        text: typeof tc.description === "string" ? tc.description : JSON.stringify(tc.description || ""),
        parent: "", _isTc: true,
        _meta: { status: tc.status, type: tc.type, reqIds, steps: tc.steps || [] },
      });
      for (const reqId of reqIds) {
        if (allReqIds.has(reqId)) {
          const key = `verify:${tc.tc_id}->${reqId}`;
          if (!edgeSet.has(key)) { edgeSet.add(key); relationships.push({ type: "verify", source: tc.tc_id, target: reqId }); tcLinkCount++; }
        }
      }
      allDiagramIds.add(tc.tc_id);
      depths[tc.tc_id] = -1;
    }
  }

  return {
    requirements: includeTestCases ? [...requirements, ...tcNodes] : requirements,
    relationships, depths, orphans,
    stats: {
      total: requirements.length,
      containment: relationships.filter((r) => r.type === "containment").length,
      crossRefs: relationships.filter((r) => r.type !== "containment" && r.type !== "verify").length,
      tcLinks: tcLinkCount, tcNodes: tcNodes.length, orphans: orphans.size,
    },
  };
}


// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const NODE_W = 224;
const NODE_H = 130;
const H_PAD = 56;
const V_PAD = 70;

const VAGUE_TERMS = [
  "fast", "slow", "easy", "simple", "efficient", "effective", "adequate",
  "sufficient", "good", "bad", "reasonable", "appropriate", "user-friendly",
  "intuitive", "flexible", "robust", "reliable", "minimal", "as needed",
  "if required", "where applicable", "easy to use", "user friendly",
  "performant", "high quality", "timely",
];

// Per-level semantic accent colors (consistent across themes)
const LEVEL_CONFIG = [
  { label: "Product Requirement", abbr: "PRD", accent: "#4d70d8", stereo: "#7090e0" },
  { label: "System Requirement", abbr: "SYS", accent: "#3d8a60", stereo: "#60c890" },
  { label: "Subsystem Requirement", abbr: "SUB", accent: "#8a7030", stereo: "#c8b050" },
  { label: "Component Requirement", abbr: "CMP", accent: "#7840a8", stereo: "#b070e0" },
];

const REL_CONFIG = {
  containment: { stroke: "#4d70d8", dash: "", markerEnd: "mk-open", markerStart: "mk-diamond" },
  deriveReqt: { stroke: "#40a878", dash: "4,3", markerEnd: "mk-derive" },
  trace: { stroke: "#9060c8", dash: "5,4", markerEnd: "mk-trace" },
  refine: { stroke: "#c07830", dash: "", markerEnd: "mk-refine" },
  verify: { stroke: "#40c870", dash: "7,4", markerEnd: "mk-verify" },
};

function getLevelCfg(depth) {
  return LEVEL_CONFIG[Math.min(Math.max(depth, 0), LEVEL_CONFIG.length - 1)];
}


// ═══════════════════════════════════════════════════════════════
// TACO ASSESSMENT
// ═══════════════════════════════════════════════════════════════

function assessTACO(req) {
  const text = (req.text || "").toLowerCase();
  const id = (req.id || "").trim();
  const T = !!id && /[A-Z]/.test(req.id);
  const A = ((req.text || "").match(/\bshall\b/gi) || []).length <= 1 ||
    !/\bshall\b.{3,60}\band\b.{3,60}\bshall\b/i.test(req.text || "");
  const C = /\bshall\b/i.test(req.text || "") && (req.text || "").trim().length >= 20;
  const O = !VAGUE_TERMS.some((t) => text.includes(t));
  return { T, A, C, O };
}


// ═══════════════════════════════════════════════════════════════
// TEXT WRAP HELPER
// ═══════════════════════════════════════════════════════════════

function wrapText(text, maxChars, maxLines) {
  const words = (text || "").split(" ");
  const lines = [];
  let cur = "";
  for (const word of words) {
    if (lines.length >= maxLines) break;
    const test = cur ? cur + " " + word : word;
    if (test.length > maxChars) {
      if (cur) { lines.push(cur); cur = word; }
      else { lines.push(word.slice(0, maxChars - 1) + "…"); cur = ""; }
    } else cur = test;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length + 2)
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s?\w+$/, "…");
  return lines;
}


// ═══════════════════════════════════════════════════════════════
// LAYOUT ENGINE
// ═══════════════════════════════════════════════════════════════

function computeLayout(reqs, rels) {
  const children = {};
  const hasParent = new Set();
  reqs.forEach((r) => { children[r.id] = []; });
  rels.filter((r) => r.type === "containment").forEach((r) => {
    if (children[r.source]) { children[r.source].push(r.target); hasParent.add(r.target); }
  });
  const roots = reqs.filter((r) => !hasParent.has(r.id)).map((r) => r.id);
  const positions = {};

  function subtreeWidth(id) {
    const kids = children[id] || [];
    if (!kids.length) return NODE_W;
    return Math.max(NODE_W, kids.reduce((s, k) => s + subtreeWidth(k), 0) + H_PAD * (kids.length - 1));
  }

  function placeNode(id, cx, y) {
    positions[id] = { x: cx, y };
    const kids = children[id] || [];
    if (!kids.length) return;
    const totalW = kids.reduce((s, k) => s + subtreeWidth(k), 0) + H_PAD * (kids.length - 1);
    let curX = cx - totalW / 2;
    for (const kid of kids) {
      const kw = subtreeWidth(kid);
      placeNode(kid, curX + kw / 2, y + NODE_H + V_PAD);
      curX += kw + H_PAD;
    }
  }

  const rootWidths = roots.map((r) => subtreeWidth(r));
  const totalW = rootWidths.reduce((a, b) => a + b, 0) + (roots.length - 1) * (H_PAD + 40);
  let startX = -totalW / 2;
  roots.forEach((rid, i) => {
    const rw = rootWidths[i];
    placeNode(rid, startX + rw / 2, 0);
    startX += rw + H_PAD + 40;
  });
  return positions;
}


// ═══════════════════════════════════════════════════════════════
// THEME-AWARE BOX RENDERING
// ═══════════════════════════════════════════════════════════════

function renderBox(parent, req, pos, depth, isOrphan, callbacks, theme) {
  const { x, y } = pos;
  const W = NODE_W, H = NODE_H, HH = 38;
  const taco = assessTACO(req);
  const allPass = taco.T && taco.A && taco.C && taco.O;
  const lc = getLevelCfg(depth);

  // Theme-aware colors
  const boxBg = theme.surfaceRaised;
  const boxBorder = isOrphan ? "#c03030" : lc.accent;
  const headerBg = isOrphan ? (theme._isLight ? "#fde8e8" : "#1e0808") : (theme._isLight ? lc.accent + "18" : lc.accent + "30");
  const idColor = isOrphan ? "#e05050" : lc.stereo;
  const nameColor = theme.textBright;
  const bodyTextColor = theme.textMuted;
  const dividerColor = lc.accent + "60";
  const tacoPassBg = theme._isLight ? "#e8f5e8" : "#0f2a0f";
  const tacoFailBg = theme._isLight ? "#fde8e8" : "#2a0f0f";
  const tacoPassBorder = theme._isLight ? "#a0d0a0" : "#204a20";
  const tacoFailBorder = theme._isLight ? "#e0a0a0" : "#4a2020";
  const tacoStripBg = allPass ? (theme._isLight ? "#f0faf0" : "#1a2a1a") : (theme._isLight ? "#faf0f0" : "#2a1a1a");
  const tacoStripBorder = allPass ? (theme._isLight ? "#c0e0c0" : "#2a4a2a") : (theme._isLight ? "#e0c0c0" : "#4a2a2a");
  const shadowColor = theme._isLight ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0.4)";

  const g = parent.append("g")
    .attr("class", "req-box")
    .attr("id", `node-${req.id.replace(/[^a-zA-Z0-9]/g, "-")}`)
    .attr("data-req-id", req.id)
    .attr("transform", `translate(${x - W / 2},${y - H / 2})`);

  // Shadow
  g.append("rect").attr("x", 3).attr("y", 3).attr("width", W).attr("height", H).attr("rx", 5).attr("fill", shadowColor);
  // Body
  g.append("rect").attr("class", "box-bg").attr("width", W).attr("height", H).attr("rx", 5)
    .attr("fill", boxBg).attr("stroke", boxBorder).attr("stroke-width", isOrphan ? 2 : 1.5);
  // Header bg
  g.append("rect").attr("class", "header-bg").attr("width", W).attr("height", HH).attr("rx", 5).attr("fill", headerBg);
  g.append("rect").attr("y", HH - 6).attr("width", W).attr("height", 6).attr("fill", headerBg);

  // Header row 1: ID + stereotype
  const dispId = req.id.length > 13 ? req.id.slice(0, 11) + "…" : req.id;
  const idLabel = isOrphan ? "⚠ " + dispId : dispId;
  g.append("text").attr("x", 6).attr("y", 11).attr("text-anchor", "start")
    .attr("fill", idColor).attr("font-size", "8.5").attr("font-weight", "700").text(idLabel);
  g.append("text").attr("x", W - 6).attr("y", 11).attr("text-anchor", "end")
    .attr("fill", lc.stereo).attr("font-size", "8.5").attr("font-style", "italic").attr("opacity", "0.85")
    .text(`«${lc.label}»`);

  // Header row 2: name
  wrapText(req.name, 26, 2).forEach((line, i) => {
    g.append("text").attr("x", W / 2).attr("y", 23 + i * 13).attr("text-anchor", "middle")
      .attr("fill", nameColor).attr("font-size", "11").attr("font-weight", "700").text(line);
  });

  // Divider
  g.append("line").attr("x1", 0).attr("y1", HH).attr("x2", W).attr("y2", HH)
    .attr("stroke", dividerColor).attr("stroke-width", "0.5");

  // Body: requirement text
  wrapText(req.text || "(no text provided)", 31, 5).forEach((line, i) => {
    g.append("text").attr("x", 9).attr("y", HH + 12 + i * 12).attr("fill", bodyTextColor).attr("font-size", "9.5").text(line);
  });

  // TACO strip
  const stripY = H - 20;
  g.append("rect").attr("y", stripY - 1).attr("width", W).attr("height", 21).attr("fill", tacoStripBg).attr("stroke", tacoStripBorder).attr("stroke-width", "0.5");
  g.append("rect").attr("y", stripY - 1).attr("width", W).attr("height", 7).attr("fill", tacoStripBg);
  g.append("rect").attr("y", stripY + 13).attr("width", W).attr("height", 8).attr("rx", 5).attr("fill", tacoStripBg);

  ["T", "A", "C", "O"].forEach((k, i) => {
    const pass = taco[k];
    const bx = 8 + i * 32;
    g.append("rect").attr("x", bx).attr("y", stripY + 2).attr("width", 28).attr("height", 15).attr("rx", 3)
      .attr("fill", pass ? tacoPassBg : tacoFailBg).attr("stroke", pass ? tacoPassBorder : tacoFailBorder).attr("stroke-width", "1");
    g.append("text").attr("x", bx + 14).attr("y", stripY + 13).attr("text-anchor", "middle")
      .attr("fill", pass ? "#4cda50" : "#f44336").attr("font-size", "9").attr("font-weight", "800").text(k);
  });
  g.append("text").attr("x", W - 8).attr("y", stripY + 13).attr("text-anchor", "end")
    .attr("fill", allPass ? "#3a7a3a" : "#7a3a3a").attr("font-size", "9").text(allPass ? "✓ All pass" : "✗ Issues found");

  // Events
  g.on("click", (event) => { event.stopPropagation(); callbacks.onSelect(req.id); });
  g.on("dblclick", (event) => { event.stopPropagation(); callbacks.onEdit(req); });
  g.on("contextmenu", (event) => { event.preventDefault(); event.stopPropagation(); callbacks.onContextMenu(event, req); });
  g.on("mouseenter", (event) => callbacks.onTooltipShow(event, req, taco, depth, isOrphan));
  g.on("mousemove", (event) => callbacks.onTooltipMove(event));
  g.on("mouseleave", () => callbacks.onTooltipHide());
}


// ═══════════════════════════════════════════════════════════════
// EDGE RENDERING
// ═══════════════════════════════════════════════════════════════

function edgePoint(pos, targetPos) {
  const dx = targetPos.x - pos.x, dy = targetPos.y - pos.y;
  if (dx === 0 && dy === 0) return pos;
  const hw = NODE_W / 2 + 6, hh = NODE_H / 2 + 6;
  const tx = dx === 0 ? Infinity : Math.abs(hw / dx);
  const ty = dy === 0 ? Infinity : Math.abs(hh / dy);
  const t = Math.min(tx, ty);
  return { x: pos.x + dx * t, y: pos.y + dy * t };
}

function renderEdges(edgesGroup, rels, positions, onCollapseToggle, theme) {
  for (const rel of rels) {
    const sp = positions[rel.source], tp = positions[rel.target];
    if (!sp || !tp) continue;
    const cfg = REL_CONFIG[rel.type] || REL_CONFIG.trace;
    const from = edgePoint(sp, tp), to = edgePoint(tp, sp);

    const eg = edgesGroup.append("g").attr("class", "edge-group")
      .attr("data-source", rel.source).attr("data-target", rel.target);

    const path = eg.append("path").attr("class", `rel-line rel-${rel.type}`)
      .attr("d", `M${from.x},${from.y} L${to.x},${to.y}`)
      .attr("stroke", cfg.stroke).attr("stroke-width", rel.type === "containment" ? 1.5 : 1.2)
      .attr("fill", "none").attr("data-source", rel.source).attr("data-target", rel.target);

    if (cfg.dash) path.attr("stroke-dasharray", cfg.dash);
    if (cfg.markerEnd) path.attr("marker-end", `url(#${cfg.markerEnd})`);
    if (cfg.markerStart) path.attr("marker-start", `url(#${cfg.markerStart})`);

    if (rel.type !== "containment") {
      const label = rel.type === "deriveReqt" ? "«deriveReqt»" : `«${rel.type}»`;
      eg.append("text").attr("x", (from.x + to.x) / 2).attr("y", (from.y + to.y) / 2 - 5)
        .attr("text-anchor", "middle").attr("fill", cfg.stroke)
        .attr("font-size", "9").attr("font-style", "italic").attr("opacity", "0.85").text(label);
    }
  }

  // Collapse buttons
  const collapseBtnBg = theme._isLight ? "#f0f4ff" : "#0e0e22";
  const collapseBtnStroke = theme._isLight ? "#8090c0" : "#4050c0";
  const collapseBtnText = theme._isLight ? "#4060a0" : "#a0b0ff";

  for (const rel of rels) {
    const sp = positions[rel.source], tp = positions[rel.target];
    if (!sp || !tp) continue;
    const mx = (sp.x + tp.x) / 2, my = (sp.y + tp.y) / 2;
    const btn = edgesGroup.append("g").attr("class", "collapse-btn")
      .attr("data-source", rel.source).attr("data-target", rel.target).attr("cursor", "pointer");

    btn.append("circle").attr("cx", mx).attr("cy", my).attr("r", 9)
      .attr("fill", collapseBtnBg).attr("stroke", collapseBtnStroke).attr("stroke-width", 1.5);
    btn.append("text").attr("class", "collapse-symbol")
      .attr("x", mx).attr("y", my + 5).attr("text-anchor", "middle")
      .attr("font-size", "15").attr("fill", collapseBtnText).attr("font-weight", "bold")
      .attr("pointer-events", "none").text("−");

    btn.on("click", (event) => {
      event.stopPropagation();
      onCollapseToggle(rel.source, rel.target);
    });
  }
}


// ═══════════════════════════════════════════════════════════════
// SELECTION + COLLAPSE HELPERS
// ═══════════════════════════════════════════════════════════════

function applySelection(svgSel, selectedId, relationships) {
  if (!selectedId) {
    svgSel.selectAll(".req-box").classed("selected", false).classed("dimmed", false);
    svgSel.selectAll(".rel-line").attr("opacity", 1);
    return;
  }
  const connected = new Set([selectedId]);
  const upQ = [selectedId];
  while (upQ.length) { const cur = upQ.shift(); relationships.forEach((r) => { if (r.target === cur && !connected.has(r.source)) { connected.add(r.source); upQ.push(r.source); } }); }
  const downQ = [selectedId];
  while (downQ.length) { const cur = downQ.shift(); relationships.forEach((r) => { if (r.source === cur && !connected.has(r.target)) { connected.add(r.target); downQ.push(r.target); } }); }
  svgSel.selectAll(".req-box").each(function () {
    const rid = d3.select(this).attr("data-req-id");
    d3.select(this).classed("selected", rid === selectedId).classed("dimmed", rid && !connected.has(rid));
  });
  svgSel.selectAll(".rel-line").attr("opacity", function () {
    const s = this.getAttribute("data-source"), t = this.getAttribute("data-target");
    return connected.has(s) && connected.has(t) ? 1 : 0.15;
  });
}

function applyCollapse(svgSel, collapsedEdges, relationships) {
  const hiddenNodes = new Set();
  for (const edgeKey of collapsedEdges) {
    const [, tgt] = edgeKey.split("|||");
    const q = [tgt];
    while (q.length) {
      const cur = q.shift();
      if (!hiddenNodes.has(cur)) {
        hiddenNodes.add(cur);
        relationships.forEach((r) => { if (r.source === cur && !hiddenNodes.has(r.target)) q.push(r.target); });
      }
    }
  }
  svgSel.selectAll(".req-box").attr("display", function () {
    return hiddenNodes.has(d3.select(this).attr("data-req-id")) ? "none" : null;
  });
  svgSel.selectAll(".edge-group").attr("display", function () {
    const s = this.getAttribute("data-source"), t = this.getAttribute("data-target");
    return hiddenNodes.has(s) || collapsedEdges.has(s + "|||" + t) ? "none" : null;
  });
  svgSel.selectAll(".collapse-btn").each(function () {
    const s = this.getAttribute("data-source"), t = this.getAttribute("data-target");
    const collapsed = collapsedEdges.has(s + "|||" + t);
    d3.select(this).attr("display", hiddenNodes.has(s) ? "none" : null);
    d3.select(this).select(".collapse-symbol").text(collapsed ? "+" : "−");
    d3.select(this).select("circle")
      .attr("fill", collapsed ? "#0a1e10" : "#0e0e22")
      .attr("stroke", collapsed ? "#30a050" : "#4050c0");
  });
  return hiddenNodes;
}


// ═══════════════════════════════════════════════════════════════
// ZOOM HELPERS
// ═══════════════════════════════════════════════════════════════

function zoomFit(svgEl, zoomBehavior, positions, animate = true) {
  if (!positions || !Object.keys(positions).length) return;
  const { width: W, height: H } = svgEl.getBoundingClientRect();
  if (!W || !H) return;
  const posArr = Object.values(positions);
  const xs = posArr.map((p) => p.x), ys = posArr.map((p) => p.y);
  const minX = Math.min(...xs) - NODE_W / 2 - 30, maxX = Math.max(...xs) + NODE_W / 2 + 30;
  const minY = Math.min(...ys) - NODE_H / 2 - 30, maxY = Math.max(...ys) + NODE_H / 2 + 30;
  const scale = Math.min(W / (maxX - minX), H / (maxY - minY), 1.2) * 0.9;
  const tx = W / 2 - scale * (minX + (maxX - minX) / 2);
  const ty = H / 2 - scale * (minY + (maxY - minY) / 2);
  const transform = d3.zoomIdentity.translate(tx, ty).scale(scale);
  const sel = d3.select(svgEl);
  if (animate) sel.transition().duration(400).call(zoomBehavior.transform, transform);
  else sel.call(zoomBehavior.transform, transform);
}


// ═══════════════════════════════════════════════════════════════
// DETECT LIGHT vs DARK THEME
// ═══════════════════════════════════════════════════════════════

function isLightTheme(T) {
  // Parse the bg color and check luminance
  const bg = T.bg || "#0B0E14";
  const hex = bg.replace("#", "");
  if (hex.length < 6) return false;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
}


// ═══════════════════════════════════════════════════════════════
// MAIN REACT COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function SysMLTraceability({ requirements: apiReqs, testCases: apiTcs, useTheme: useThemeFn, Badge, Card, Button, mono, font: fontFamily }) {
  const T = useThemeFn();
  const _isLight = isLightTheme(T);
  // Build a theme object that D3 rendering can use (no React context needed)
  const themeForD3 = useMemo(() => ({ ...T, _isLight }), [T, _isLight]);

  // Refs
  const svgRef = useRef(null);
  const canvasRef = useRef(null);
  const zoomRef = useRef(null);
  const positionsRef = useRef({});

  // State
  const [selectedId, setSelectedId] = useState(null);
  const [collapsedEdges, setCollapsedEdges] = useState(new Set());
  const [tooltip, setTooltip] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [editingReq, setEditingReq] = useState(null);
  const [finderQuery, setFinderQuery] = useState("");
  const [finderCollapsed, setFinderCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState("full");
  const [viewTarget, setViewTarget] = useState(null);

  // Transform
  const diagramData = useMemo(
    () => transformForDiagram(apiReqs || [], apiTcs || [], { includeTestCases: false }),
    [apiReqs, apiTcs]
  );

  const [activeReqs, setActiveReqs] = useState([]);
  const [activeRels, setActiveRels] = useState([]);

  useEffect(() => {
    if (viewMode === "full") {
      setActiveReqs(diagramData.requirements);
      setActiveRels(diagramData.relationships);
    }
  }, [diagramData, viewMode]);

  // Inject CSS
  useEffect(() => {
    const id = "sysml-d3-styles";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
      .req-box { cursor: pointer; }
      .req-box .box-bg { stroke-width: 1.5; }
      .req-box.selected .box-bg { stroke-width: 2.5 !important; }
      .req-box.dimmed { opacity: 0.25; }
    `;
    document.head.appendChild(style);
    return () => { const el = document.getElementById(id); if (el) el.remove(); };
  }, []);

  // Init zoom
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const zoom = d3.zoom().scaleExtent([0.05, 4]).on("zoom", (event) => {
      d3.select(canvasRef.current).attr("transform", event.transform);
    });
    svg.call(zoom);
    zoomRef.current = zoom;
  }, []);

  // Render diagram
  useEffect(() => {
    if (!activeReqs.length || !svgRef.current || !canvasRef.current) return;

    const canvas = d3.select(canvasRef.current);
    canvas.selectAll("*").remove();

    const positions = computeLayout(activeReqs, activeRels);
    positionsRef.current = positions;

    const callbacks = {
      onSelect: (id) => setSelectedId((prev) => (prev === id ? null : id)),
      onEdit: (req) => { setTooltip(null); setEditingReq(req); },
      onContextMenu: (event, req) => { setTooltip(null); setContextMenu({ x: event.clientX, y: event.clientY, req }); },
      onTooltipShow: (event, req, taco, depth, isOrphan) => setTooltip({ x: event.clientX, y: event.clientY, req, taco, depth, isOrphan }),
      onTooltipMove: (event) => setTooltip((prev) => prev ? { ...prev, x: event.clientX, y: event.clientY } : null),
      onTooltipHide: () => setTooltip(null),
    };

    const edgesGroup = canvas.append("g").attr("class", "edges");
    renderEdges(edgesGroup, activeRels, positions, (source, target) => {
      setCollapsedEdges((prev) => {
        const next = new Set(prev);
        const key = source + "|||" + target;
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
      });
    }, themeForD3);

    const nodesGroup = canvas.append("g").attr("class", "nodes");
    for (const req of activeReqs) {
      const pos = positions[req.id];
      if (pos) renderBox(nodesGroup, req, pos, diagramData.depths[req.id] || 0, diagramData.orphans.has(req.id), callbacks, themeForD3);
    }

    d3.select(svgRef.current).on("click", () => setSelectedId(null));

    if (zoomRef.current) zoomFit(svgRef.current, zoomRef.current, positions, false);
    setCollapsedEdges(new Set());
  }, [activeReqs, activeRels, diagramData.depths, diagramData.orphans, themeForD3]);

  // Apply selection
  useEffect(() => {
    if (!svgRef.current) return;
    applySelection(d3.select(svgRef.current), selectedId, activeRels);
  }, [selectedId, activeRels]);

  // Apply collapse
  useEffect(() => {
    if (!svgRef.current) return;
    const hidden = applyCollapse(d3.select(svgRef.current), collapsedEdges, activeRels);
    if (selectedId && hidden.has(selectedId)) setSelectedId(null);
  }, [collapsedEdges, activeRels, selectedId]);

  // Close context menu
  useEffect(() => {
    const handler = () => setContextMenu(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  // Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") { setEditingReq(null); setContextMenu(null); } };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Family view
  const enterFamilyView = useCallback((rootId) => {
    const familyIds = new Set([rootId]);
    const upQ = [rootId];
    while (upQ.length) { const cur = upQ.shift(); diagramData.relationships.forEach((r) => { if (r.target === cur && !familyIds.has(r.source)) { familyIds.add(r.source); upQ.push(r.source); } }); }
    const downQ = [rootId];
    while (downQ.length) { const cur = downQ.shift(); diagramData.relationships.forEach((r) => { if (r.source === cur && !familyIds.has(r.target)) { familyIds.add(r.target); downQ.push(r.target); } }); }
    const snap = new Set(familyIds);
    snap.forEach((fid) => {
      diagramData.relationships.forEach((r) => { if (r.target === fid) { diagramData.relationships.forEach((r2) => { if (r2.source === r.source && !familyIds.has(r2.target)) familyIds.add(r2.target); }); } });
    });
    setViewMode("family"); setViewTarget(rootId);
    setActiveReqs(diagramData.requirements.filter((r) => familyIds.has(r.id)));
    setActiveRels(diagramData.relationships.filter((r) => familyIds.has(r.source) && familyIds.has(r.target)));
    setSelectedId(null);
  }, [diagramData]);

  // Level view
  const enterLevelView = useCallback((depth) => {
    const filtered = diagramData.requirements.filter((r) => (diagramData.depths[r.id] || 0) === depth);
    if (!filtered.length) return;
    const ids = new Set(filtered.map((r) => r.id));
    setViewMode("level"); setViewTarget(depth);
    setActiveReqs(filtered);
    setActiveRels(diagramData.relationships.filter((r) => ids.has(r.source) && ids.has(r.target)));
    setSelectedId(null);
  }, [diagramData]);

  const exitFilteredView = useCallback(() => {
    setViewMode("full"); setViewTarget(null);
    setActiveReqs(diagramData.requirements);
    setActiveRels(diagramData.relationships);
    setSelectedId(null);
  }, [diagramData]);

  const panToReq = useCallback((reqId) => {
    const pos = positionsRef.current[reqId];
    if (!pos || !svgRef.current || !zoomRef.current) return;
    const { width: W, height: H } = svgRef.current.getBoundingClientRect();
    const scale = Math.min(Math.max(Math.min(W / (NODE_W * 2.5), H / (NODE_H * 2.5)), 0.6), 1.4);
    const tx = W / 2 - scale * pos.x, ty = H / 2 - scale * pos.y;
    const transform = d3.zoomIdentity.translate(tx, ty).scale(scale);
    d3.select(svgRef.current).transition().duration(500).call(zoomRef.current.transform, transform);
    setSelectedId(reqId);
  }, []);

  const finderReqs = useMemo(() => {
    const q = finderQuery.toLowerCase().trim();
    if (!q) return activeReqs;
    return activeReqs.filter((r) => r.id.toLowerCase().includes(q) || (r.name || "").toLowerCase().includes(q));
  }, [activeReqs, finderQuery]);

  const exportSVG = useCallback(() => {
    if (!svgRef.current) return;
    const clone = svgRef.current.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
    style.textContent = "text{font-family:'Segoe UI',sans-serif;}.req-box{cursor:default;}";
    clone.insertBefore(style, clone.firstChild);
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "sysml-requirements-diagram.svg";
    a.click();
    URL.revokeObjectURL(a.href);
  }, []);

  const hasData = activeReqs.length > 0;
  const viewLabel = viewMode === "family" ? `Family: ${viewTarget}` : viewMode === "level" ? `Level: ${getLevelCfg(viewTarget).label}` : null;

  // Panel colors that adapt to theme
  const panelBg = _isLight ? "rgba(255,255,255,0.92)" : "rgba(8,10,20,0.95)";
  const panelBorder = T.border;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>

      {/* Header */}
      <div style={{ padding: "12px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12, flexShrink: 0, background: T.surface }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: T.textBright, margin: 0 }}>SysML Requirements Diagram</h2>
          <p style={{ fontSize: 10, color: T.textMuted, margin: "2px 0 0", fontFamily: mono }}>
            TC-007 · {diagramData.stats.total} requirements · {diagramData.stats.containment} containment · {diagramData.stats.crossRefs} cross-refs
            {diagramData.stats.orphans > 0 && <span style={{ color: T.red }}> · {diagramData.stats.orphans} orphans</span>}
          </p>
        </div>
        <button onClick={() => zoomRef.current && svgRef.current && zoomFit(svgRef.current, zoomRef.current, positionsRef.current)} style={btnStyle(T)}>⊡ Fit</button>
        <button onClick={() => svgRef.current && zoomRef.current && d3.select(svgRef.current).transition().duration(200).call(zoomRef.current.scaleBy, 1.3)} style={btnStyle(T)}>＋</button>
        <button onClick={() => svgRef.current && zoomRef.current && d3.select(svgRef.current).transition().duration(200).call(zoomRef.current.scaleBy, 0.77)} style={btnStyle(T)}>－</button>
        <button onClick={exportSVG} style={btnStyle(T)}>↓ SVG</button>
      </div>

      {/* Filtered view banner */}
      {viewMode !== "full" && (
        <div style={{ padding: "6px 20px", background: _isLight ? "#e8f0ff" : "#0e1a38", borderBottom: `1px solid ${_isLight ? "#c0d0f0" : "#1e3068"}`, display: "flex", alignItems: "center", gap: 10, fontSize: 11, flexShrink: 0 }}>
          <span style={{ color: _isLight ? "#4060a0" : "#6080c0", fontWeight: 700 }}>{viewMode === "family" ? "Family View" : "Level View"}</span>
          <span style={{ color: _isLight ? "#2050a0" : "#90b0f0", fontFamily: mono }}>{viewLabel}</span>
          <span style={{ color: _isLight ? "#6080b0" : "#4060a0", fontSize: 10 }}>({activeReqs.length} req{activeReqs.length !== 1 ? "s" : ""})</span>
          <button onClick={exitFilteredView} style={{ ...btnStyle(T), marginLeft: "auto" }}>← Back to Full View</button>
        </div>
      )}

      {/* Diagram area */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden", background: T.bg }}>

        {!hasData && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, pointerEvents: "none" }}>
            <div style={{ fontSize: 64, opacity: 0.07 }}>◈</div>
            <p style={{ fontSize: 14, color: T.textMuted, textAlign: "center", lineHeight: 1.6 }}>
              No requirements to display.<br />Import requirements to see the diagram.
            </p>
          </div>
        )}

        <svg ref={svgRef} style={{ width: "100%", height: "100%", display: hasData ? "block" : "none" }}>
          <defs>
            <marker id="mk-open" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polyline points="0 0, 9 3.5, 0 7" fill="none" stroke="#4d70d8" strokeWidth="1.5" /></marker>
            <marker id="mk-diamond" markerWidth="12" markerHeight="8" refX="0" refY="4" orient="auto"><polygon points="0 4, 6 0, 12 4, 6 8" fill="#3d5ab8" /></marker>
            <marker id="mk-trace" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polyline points="0 0, 9 3.5, 0 7" fill="none" stroke="#9060c8" strokeWidth="1.5" /></marker>
            <marker id="mk-derive" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polyline points="0 0, 9 3.5, 0 7" fill="none" stroke="#40a878" strokeWidth="1.5" /></marker>
            <marker id="mk-refine" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polyline points="0 0, 9 3.5, 0 7" fill="none" stroke="#c07830" strokeWidth="1.5" /></marker>
            <marker id="mk-verify" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polyline points="0 0, 9 3.5, 0 7" fill="none" stroke="#40c870" strokeWidth="1.5" /></marker>
          </defs>
          <g ref={canvasRef} />
        </svg>

        {/* Finder panel */}
        {hasData && (
          <div style={{ position: "absolute", top: 12, right: 12, width: 210, background: panelBg, border: `1px solid ${panelBorder}`, borderRadius: 6, display: "flex", flexDirection: "column", maxHeight: "calc(100% - 24px)", zIndex: 50, backdropFilter: "blur(8px)" }}>
            <div style={{ padding: "7px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${panelBorder}`, flexShrink: 0 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: T.textMuted, letterSpacing: "0.6px", textTransform: "uppercase" }}>
                Finder <span style={{ opacity: 0.6 }}>({finderReqs.length})</span>
              </span>
              <button onClick={() => setFinderCollapsed(!finderCollapsed)}
                style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: 3, color: T.textMuted, cursor: "pointer", fontSize: 12, lineHeight: 1, padding: "1px 7px" }}>
                {finderCollapsed ? "+" : "−"}
              </button>
            </div>
            {!finderCollapsed && (
              <>
                <div style={{ padding: "6px 8px", borderBottom: `1px solid ${panelBorder}`, flexShrink: 0 }}>
                  <input
                    type="text" value={finderQuery} onChange={(e) => setFinderQuery(e.target.value)}
                    placeholder="Search ID or name…"
                    style={{ width: "100%", boxSizing: "border-box", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, color: T.text, fontSize: 10, padding: "4px 7px", outline: "none", fontFamily: "inherit" }}
                  />
                </div>
                <div style={{ overflowY: "auto", flex: 1 }}>
                  {finderReqs.length === 0 && <div style={{ padding: "12px 10px", fontSize: 10, color: T.textMuted, textAlign: "center", fontStyle: "italic" }}>No matches</div>}
                  {finderReqs.map((r) => (
                    <div key={r.id} onClick={() => panToReq(r.id)} style={{ padding: "5px 10px", fontSize: 10, color: T.textMuted, cursor: "pointer", borderBottom: `1px solid ${T.bg}`, lineHeight: 1.4 }}>
                      <span style={{ color: T.accent, fontWeight: 700, fontFamily: mono, fontSize: 9.5, display: "block" }}>{r.id}</span>
                      <span style={{ display: "block", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: T.textMuted }}>{r.name}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Legend */}
        {hasData && (
          <div style={{ position: "absolute", bottom: 12, right: 12, background: panelBg, border: `1px solid ${panelBorder}`, borderRadius: 6, padding: "10px 12px", fontSize: 10, minWidth: 170, zIndex: 40, backdropFilter: "blur(8px)" }}>
            <div style={{ color: T.textMuted, fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: 7, fontSize: 9 }}>Relationships</div>
            {[
              { label: "containment", color: "#4d70d8", dash: false },
              { label: "«deriveReqt»", color: "#40a878", dash: true },
              { label: "«trace»", color: "#9060c8", dash: true },
              { label: "«refine»", color: "#c07830", dash: false },
              { label: "«verify»", color: "#40c870", dash: true },
            ].map((l) => (
              <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 7, margin: "4px 0", color: T.text }}>
                <svg width="34" height="10"><line x1="0" y1="5" x2="34" y2="5" stroke={l.color} strokeWidth="1.5" strokeDasharray={l.dash ? "5,3" : undefined} /></svg>
                {l.label}
              </div>
            ))}

            <div style={{ color: T.textMuted, fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", marginTop: 9, marginBottom: 7, fontSize: 9 }}>
              Requirement Levels <span style={{ fontSize: 8, fontWeight: 400 }}>(click to filter)</span>
            </div>
            {LEVEL_CONFIG.map((lc, i) => (
              <div key={lc.abbr} onClick={() => enterLevelView(i)}
                style={{ display: "flex", alignItems: "center", gap: 7, margin: "4px 0", color: T.text, cursor: "pointer", padding: "3px 6px", borderRadius: 4, marginLeft: -6, marginRight: -6 }}>
                <span style={{ display: "inline-block", padding: "1px 5px", borderRadius: 3, fontSize: 9, fontWeight: 700, background: T.surface, border: `1px solid ${lc.accent}`, color: lc.stereo }}>{lc.abbr}</span>
                {lc.label}
              </div>
            ))}

            <div style={{ color: T.textMuted, fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", marginTop: 9, marginBottom: 7, fontSize: 9 }}>TACO Compliance</div>
            {[
              { k: "T", label: "Traceable — has a unique ID" },
              { k: "A", label: 'Atomic — single "shall"' },
              { k: "C", label: 'Clear — includes "shall"' },
              { k: "O", label: "Objective — no vague terms" },
            ].map((t) => (
              <div key={t.k} style={{ display: "flex", alignItems: "center", gap: 7, margin: "4px 0", color: T.text }}>
                <span style={{ display: "inline-flex", width: 16, height: 16, borderRadius: 3, fontSize: 9, fontWeight: 800, alignItems: "center", justifyContent: "center", background: _isLight ? "#e8f5e8" : "#0f2a0f", color: "#4caf50" }}>{t.k}</span>
                {t.label}
              </div>
            ))}
          </div>
        )}

        {/* Tooltip */}
        {tooltip && (
          <div style={{
            position: "fixed", left: tooltip.x + 12, top: tooltip.y + 12,
            background: T.surfaceRaised, border: `1px solid ${T.border}`, borderRadius: 6,
            padding: "10px 14px", fontSize: 11, color: T.text, pointerEvents: "none",
            maxWidth: 280, zIndex: 9999, boxShadow: _isLight ? "0 8px 32px rgba(0,0,0,0.12)" : "0 8px 32px rgba(0,0,0,0.6)", lineHeight: 1.7,
          }}>
            <div style={{ color: T.accent, fontWeight: 700, marginBottom: 4, fontSize: 12 }}>{tooltip.req.id}</div>
            {tooltip.isOrphan && (
              <div style={{ marginBottom: 7, padding: "5px 8px", background: T.redDim, border: `1px solid ${T.red}44`, borderRadius: 4, color: T.red, fontSize: 10, lineHeight: 1.5 }}>
                ⚠ Missing parent requirement
              </div>
            )}
            <div style={{ marginBottom: 6 }}>
              <span style={{ padding: "1px 6px", borderRadius: 3, fontSize: 10, fontWeight: 700, background: T.surface, border: `1px solid ${getLevelCfg(tooltip.depth || 0).accent}`, color: getLevelCfg(tooltip.depth || 0).stereo }}>{getLevelCfg(tooltip.depth || 0).label}</span>
            </div>
            <div style={{ color: T.textMuted, fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>Name</div>
            <div style={{ color: T.textBright, margin: "2px 0 6px" }}>{tooltip.req.name}</div>
            <div style={{ color: T.textMuted, fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>Text</div>
            <div style={{ color: T.text, marginTop: 4 }}>{tooltip.req.text || "No text provided"}</div>
            {tooltip.req._meta?.priority && (
              <div style={{ marginTop: 6 }}><span style={{ color: T.textMuted, fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>Priority</span> <span style={{ color: T.amber }}>{tooltip.req._meta.priority}</span></div>
            )}
            {tooltip.req._meta?.status && (
              <div><span style={{ color: T.textMuted, fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>Status</span> <span style={{ color: T.green }}>{tooltip.req._meta.status}</span></div>
            )}
            <div style={{ marginTop: 8, lineHeight: 1.8 }}>
              {["T", "A", "C", "O"].map((k) => (
                <span key={k} style={{ marginRight: 8 }}>
                  <span style={{ display: "inline-block", width: 17, height: 17, borderRadius: 3, fontSize: 9, fontWeight: 800, textAlign: "center", lineHeight: "17px", background: tooltip.taco[k] ? (_isLight ? "#e8f5e8" : "#0f2a0f") : (_isLight ? "#fde8e8" : "#2a0f0f"), color: tooltip.taco[k] ? "#4caf50" : "#f44336", border: `1px solid ${tooltip.taco[k] ? (_isLight ? "#a0d0a0" : "#1a4a1a") : (_isLight ? "#e0a0a0" : "#4a1a1a")}` }}>{k}</span>
                  <span style={{ color: tooltip.taco[k] ? T.green : T.red, marginLeft: 3, fontSize: 10 }}>{tooltip.taco[k] ? "✓" : "✗"}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Context menu */}
        {contextMenu && (
          <div style={{ position: "fixed", left: contextMenu.x, top: contextMenu.y, background: T.surfaceRaised, border: `1px solid ${T.border}`, borderRadius: 6, padding: "4px 0", minWidth: 210, zIndex: 10000, boxShadow: _isLight ? "0 8px 32px rgba(0,0,0,0.12)" : "0 8px 32px rgba(0,0,0,0.7)" }}>
            <div style={{ padding: "6px 14px 5px", fontSize: 9, fontWeight: 700, color: T.textMuted, letterSpacing: "0.7px", textTransform: "uppercase", borderBottom: `1px solid ${T.border}`, marginBottom: 3 }}>
              {contextMenu.req.id}
            </div>
            <div onClick={() => { enterFamilyView(contextMenu.req.id); setContextMenu(null); }}
              style={{ padding: "8px 14px", fontSize: 12, color: T.text, cursor: "pointer", display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ fontSize: 14 }}>◈</span> View Requirement Family
            </div>
          </div>
        )}
      </div>

      {/* TACO Assessment pane */}
      {hasData && (
        <div style={{ maxHeight: 180, overflowY: "auto", borderTop: `1px solid ${T.border}`, background: T.surface, flexShrink: 0 }}>
          <div style={{ padding: "6px 12px", fontSize: 10, fontWeight: 700, color: T.textMuted, letterSpacing: "0.8px", textTransform: "uppercase", background: T.surface, borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 1 }}>
            <span>TACO Assessment</span>
            <span style={{ fontWeight: 400 }}>
              {(() => {
                const pass = activeReqs.filter((r) => { const t = assessTACO(r); return t.T && t.A && t.C && t.O; }).length;
                const pct = activeReqs.length ? Math.round((pass / activeReqs.length) * 100) : 0;
                return `${pass}/${activeReqs.length} fully compliant (${pct}%)`;
              })()}
            </span>
          </div>
          {activeReqs.map((req) => {
            const taco = assessTACO(req);
            const depth = diagramData.depths[req.id] || 0;
            const lc = getLevelCfg(depth);
            const isOrphan = diagramData.orphans.has(req.id);
            return (
              <div key={req.id} onClick={() => panToReq(req.id)}
                style={{ padding: "5px 12px", display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${T.bg}`, fontSize: 11, cursor: "pointer", background: isOrphan ? T.redDim : undefined }}>
                <span style={{ color: T.accent, fontWeight: 600, minWidth: 72, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 110 }} title={req.id}>{req.id}</span>
                {isOrphan && <span style={{ color: T.red, fontSize: 11 }} title="Missing parent">⚠</span>}
                <span style={{ display: "inline-block", padding: "1px 5px", borderRadius: 3, fontSize: 9, fontWeight: 700, background: T.surface, border: `1px solid ${lc.accent}`, color: lc.stereo }}>{lc.abbr}</span>
                <span style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                  {["T", "A", "C", "O"].map((k) => (
                    <span key={k} style={{ display: "inline-block", width: 17, height: 17, borderRadius: 3, fontSize: 9, fontWeight: 800, textAlign: "center", lineHeight: "17px", background: taco[k] ? (_isLight ? "#e8f5e8" : "#0f2a0f") : (_isLight ? "#fde8e8" : "#2a0f0f"), color: taco[k] ? "#4caf50" : "#f44336", border: `1px solid ${taco[k] ? (_isLight ? "#a0d0a0" : "#1a4a1a") : (_isLight ? "#e0a0a0" : "#4a1a1a")}` }}>{k}</span>
                  ))}
                </span>
                <span style={{ color: T.textMuted, fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{req.name}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════
// SHARED STYLE HELPERS
// ═══════════════════════════════════════════════════════════════

function btnStyle(T) {
  return {
    padding: "4px 10px", border: `1px solid ${T.border}`, background: T.surface,
    color: T.textMuted, borderRadius: 4, cursor: "pointer", fontSize: 11,
    fontFamily: "inherit", transition: "background 0.15s, color 0.15s",
  };
}