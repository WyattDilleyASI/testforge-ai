import { useState, useCallback } from "react";

// ── useAsyncAction ────────────────────────────────────────────────────────────
// Wraps any async call with loading + error state.
// Pass the function at call-time so no memoization is needed at the call site.
//
// Usage:
//   const [run, { loading, error, clearError }] = useAsyncAction();
//   run(() => api.deleteItem(id));
//
export function useAsyncAction() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const execute = useCallback(async (fn) => {
    setLoading(true);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  return [execute, { loading, error, clearError: () => setError("") }];
}

// ── useSelection ──────────────────────────────────────────────────────────────
// Manages a Set of selected IDs with toggle, toggleAll, and clear.
// Pass the list that is currently rendered (e.g. filteredItems, not allItems)
// so that "Select All" matches what the user sees.
//
// Usage:
//   const { selectedIds, toggle, toggleAll, clear, isSelected, allSelected }
//     = useSelection(filteredTcs, tc => tc.tc_id);
//
export function useSelection(items = [], getId = (item) => item.id) {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectMode, setSelectMode] = useState(false);

  const toggle = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) =>
      prev.size === items.length
        ? new Set()
        : new Set(items.map(getId))
    );
  }, [items, getId]);

  const clear = useCallback(() => setSelectedIds(new Set()), []);

  const isSelected = useCallback((id) => selectedIds.has(id), [selectedIds]);

  const enterSelectMode = useCallback(() => {
    setSelectedIds(new Set());
    setSelectMode(true);
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectedIds(new Set());
    setSelectMode(false);
  }, []);

  return {
    selectedIds,
    toggle,
    toggleAll,
    clear,
    isSelected,
    allSelected: items.length > 0 && selectedIds.size === items.length,
    selectMode,
    enterSelectMode,
    exitSelectMode,
  };
}

// ── useExpandCollapse ─────────────────────────────────────────────────────────
// Single-open accordion: at most one item is expanded at a time.
// Toggling the already-open item closes it.
//
// Usage:
//   const { isExpanded, toggle, collapse } = useExpandCollapse();
//   toggle(tc.tc_id);   // open or close
//   isExpanded(tc.tc_id); // boolean
//
// Note: NOT suitable for KbView's multi-collapse with localStorage persistence.
//
export function useExpandCollapse(initial = null) {
  const [expanded, setExpanded] = useState(initial);

  const toggle = useCallback((id) => {
    setExpanded((prev) => (prev === id ? null : id));
  }, []);

  const collapse = useCallback(() => setExpanded(null), []);

  const isExpanded = useCallback((id) => expanded === id, [expanded]);

  return { expanded, toggle, collapse, isExpanded };
}

// ── useInlineEdit ─────────────────────────────────────────────────────────────
// Tracks which item is currently being edited and holds the form values.
// Does NOT manage saving state — pair with useAsyncAction() for the save call.
//
// Usage:
//   const { editingId, editForm, setEditForm, startEdit, cancelEdit, isEditing }
//     = useInlineEdit();
//   startEdit(tc.tc_id, { title: tc.title, ... });
//   isEditing(tc.tc_id); // boolean
//
export function useInlineEdit() {
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);

  const startEdit = useCallback((id, initialForm) => {
    setEditingId(id);
    setEditForm(initialForm);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditForm(null);
  }, []);

  const isEditing = useCallback((id) => editingId === id, [editingId]);

  return { editingId, editForm, setEditForm, startEdit, cancelEdit, isEditing };
}
