// Release notes shown to each user on their first login after a new
// entry is added. Append new entries to the TOP of the array. The
// modal compares the latest entry's `id` against
// localStorage["tf_whats_new_seen"] and surfaces every entry the
// current user hasn't acknowledged yet (capped at 3 to avoid dumping
// the entire history on someone returning from a long break).
//
// Entry shape:
//   {
//     id:    Unique slug (typically YYYY-MM-DD-feature). Bumping this
//            triggers the modal again on next login.
//     date:  Display date in ISO format ("YYYY-MM-DD").
//     title: One-line headline.
//     bullets: Array of strings — what changed, plainly stated.
//   }

export const WHATS_NEW = [
  {
    id: "2026-06-01-jama-setup-merged-into-description",
    date: "2026-06-01",
    title: "Action required: re-save your Jama field mapping",
    bullets: [
      "Jama is merging the Setup field into Description across all Test Case items on 2026-06-02 (5:00–7:00 AM MDT). Setup content will live inside Description from now on.",
      "Testforge's XLSX export has been updated to match: the Setup column is gone, and Setup content is appended to the Description column with a blank line separator.",
      "After the Jama tenant migration finishes on June 2, open each of your export profiles' configured Jama project and run one manual XLSX import using a fresh Testforge export. Re-save the field mapping (overwrite the existing one with the same name) so it reflects the new column layout.",
      "Pushes attempted between today and the Jama migration completing will fail to import because the old saved mapping still expects a Setup column. Wait until after Jama's migration window to push, or push now and retry after re-saving the mapping.",
    ],
  },
  {
    id: "2026-05-27-jama-integration",
    date: "2026-05-27",
    title: "Two-way Jama integration",
    bullets: [
      "Import requirements FROM Jama: configure an import profile (Requirements view → Jama Import) tied to a Jama project URL and filter name. Running it pulls every item matching that filter into Testforge. Failed imports can be rolled back to undo the upsert.",
      "Push test cases TO Jama: select test cases in the Library and use 'Push to Jama' on the bulk action bar to send them to a Jama Set. Pushed TCs get a 'jama_exported_at' stamp so the Library shows which have been synced.",
      "The push flow now has a destination step — the saved default for your export profile is pre-selected, but you can pick a different Set for a one-off push without changing the profile default.",
      "Long pushes can be closed: click 'Close (keep running)' on the progress view and the export keeps going in the background. A toast appears at the top of the screen when it finishes.",
      "Both directions run via a headless browser session that signs in fresh each time — your Jama credentials are entered per-run and never persisted to disk, the database, or any log.",
      "First-time setup: managers create import profiles (Requirements view) and export profiles (Library → 'Configure Jama export'). Export requires a one-time manual import in Jama to save a field mapping the automation then reuses.",
    ],
  },
];

export const WHATS_NEW_STORAGE_KEY = "tf_whats_new_seen";

// Returns the entries the current user hasn't dismissed yet. Caps at
// MAX_UNSEEN so a returning user doesn't see a wall of text. Returns
// an empty array when there's nothing to show.
const MAX_UNSEEN = 3;
export function unseenWhatsNewEntries(lastSeenId) {
  if (!WHATS_NEW.length) return [];
  if (!lastSeenId) return WHATS_NEW.slice(0, MAX_UNSEEN);
  const seenIdx = WHATS_NEW.findIndex((e) => e.id === lastSeenId);
  if (seenIdx === 0) return [];                                  // already seen the latest
  if (seenIdx === -1) return WHATS_NEW.slice(0, MAX_UNSEEN);     // unknown id (older release that's no longer in the list)
  return WHATS_NEW.slice(0, Math.min(seenIdx, MAX_UNSEEN));
}
