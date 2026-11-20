export const title = "Starside Sync and Build Lifecycle Protocol";

export const state = (v) => {
  if (v.silentOverwrite) return "Unseen remote edit overwritten";
  if (v.sweptClean && v.disk !== "NONE") return "Deleted build resurrected on disk";
  if (v.syncPc === "idle") {
    if (v.disk === "NONE" && v.doc === "NONE") return "Deleted cleanly";
    if (v.disk === v.doc && v.doc === v.base) {
      return v.landed === v.doc ? "Synced steady state" : "Synced but landed flag stale";
    }
    if (v.dropSub === "approved") return "Deletion approved (pending sweep)";
    if (v.disk !== v.base && v.doc !== v.base) return "Diverged (conflict)";
    if (v.disk !== v.base) return "Local change pending sync";
    if (v.doc !== v.base) return "Remote edit pending sync";
    return "Partial state (idle)";
  }
  if (v.syncPc === "snap") return v.snapDrop ? "Sync: sweeping approved delete" : "Sync: snapshot taken";
  if (v.syncPc === "drop_doc_done") return "Sync: remote doc deleted (subs still present)";
  if (v.syncPc === "drop_subs_done") return "Sync: remote doc and subs deleted (local file left)";
  if (v.syncPc === "after_sweep") return "Sync: ready to land and reconcile";
  if (v.syncPc === "pulled_disk") return "Sync: pulled remote to disk (landed pending)";
  if (v.syncPc === "take_mine_loaded") return "Operator: --mine snapshot loaded";
  return v.syncPc;
};

export const step = (action) => {
  switch (action) {
    case "EditorBsave": return "editor saves remote build";
    case "EditorBdrop": return "editor requests build deletion";
    case "EditorApproveDrop": return "reviewer approves deletion";
    case "LocalEdit": return "author edits local file";
    case "LocalDelete": return "author deletes local file";
    case "SyncSnapshot": return "sync pulls remote snapshot";
    case "SweepConflict": return "sweep flags dirty conflict";
    case "SweepDropTxOk": return "drop tx deletes remote doc";
    case "SweepDropTxConflict": return "drop tx rejects stale baseHash";
    case "SweepDropCleanupSubs": return "drop cleans approved subs";
    case "SweepDropCrashBeforeSubs": return "crash before sub cleanup";
    case "SweepRemoveLocal": return "sweep removes local file";
    case "SweepCrashBeforeLocal": return "crash before local delete";
    case "SweepSkip": return "sweep has no deletion";
    case "LandAndFinishNoPull": return "reconcile (same/push/drop/stuck)";
    case "LandAndPullWriteDisk": return "pull writes remote to disk";
    case "PullCommitLanded": return "pull records landed and baseline";
    case "TakeMineLoad": return "operator starts --mine";
    case "TakeMineSend": return "operator pushes --mine (no baseHash)";
    default: return action;
  }
};

export const group = (v) => {
  if (v.silentOverwrite || (v.sweptClean && v.disk !== "NONE")) return "broken";
  if (v.syncPc !== "idle") return "inflight";
  if (v.disk === "NONE" && v.doc === "NONE") return "deleted";
  if (v.disk === v.doc && v.doc === v.base) return "steady";
  return "dirty";
};

export const colors = {
  steady: "teal",
  dirty: "blue",
  inflight: "yellow",
  deleted: "tan",
  broken: "pink",
};
