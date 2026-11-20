---------------------------- MODULE SyncProtocol ----------------------------
(*
 * Formal model of the Starside three-way sync and build lifecycle protocol
 * across tools/sync.py and functions/api/index.js.
 *
 * Scope:
 *   - 1 build document (builds/s29/x) with disjoint edit versions:
 *       V1  = initial synced content
 *       VL  = local author edit on disk
 *       VR1 = first online editor save (bsave)
 *       VR2 = second online editor save (bsave) concurrent with sync/take_docs
 *   - Local disk (references/builds/s29/x.json) and .sync-base baseline
 *   - CloudBase docs[id] (md + landed), approved create sub (subs ok=1 drop=0),
 *     and deletion request sub (subs drop=1, ok in none/pending/approved)
 *   - Real network/transaction boundaries and crash points:
 *       * sync.py:sync()          — pull+list -> sweep() -> land() -> push/pull/drop -> landed
 *       * sync.py:take_docs()     — --mine resolution (unconditional push, no baseHash)
 *       * index.js:bsave/bdrop/smark(drop) — online editor actions interleaving at any step
 *       * index.js:drop           — tx removes docs[id], THEN non-tx cleanup removes ok=1 subs
 *
 * Every action name maps directly to a concrete step in tools/sync.py or functions/api/index.js.
 *)

EXTENDS Naturals

CONSTANTS NONE, V1, VL, VR1, VR2

Versions == {NONE, V1, VL, VR1, VR2}

VARIABLES
  disk,              \* local file content in references/builds/<season>/<slug>.json
  base,              \* .sync-base recorded hash
  doc,               \* CloudBase docs[id].md
  landed,            \* CloudBase docs[id].landed
  subOk,             \* CloudBase subs approved create submission (ok=1, drop=0)
  dropSub,           \* CloudBase subs deletion request: "none" | "pending" | "approved"
  syncPc,            \* sync.py stage
  snapDoc,           \* db[doc_id] snapshot from sync.py:513 (or take_docs:650)
  snapLanded,        \* landed[doc_id] snapshot from sync.py:524
  snapSubOk,         \* approved create sub snapshot from sync.py:514
  snapDrop,          \* whether an approved drop sub existed at sync.py:514
  goneInRun,         \* doc_id in gone returned by sync.py:sweep()
  conflictInRun,     \* doc_id in conflicts returned by sync.py:sweep()
  sweptClean,        \* ghost: TRUE after an approved deletion completes both remote & local delete
  silentOverwrite,   \* ghost: TRUE if an unseen remote edit is overwritten without conflict
  unilateralLocalDel \* ghost: TRUE if local unchanged file is deleted merely because remote is NONE

vars == <<disk, base, doc, landed, subOk, dropSub, syncPc,
          snapDoc, snapLanded, snapSubOk, snapDrop,
          goneInRun, conflictInRun, sweptClean, silentOverwrite, unilateralLocalDel>>

\* Exact translation of tools/sync.py:227-245 plan(d, r, b)
Plan(d, r, b) ==
  IF d = r THEN "same"
  ELSE IF b = NONE THEN
    IF r = NONE THEN "push" ELSE "stuck"
  ELSE IF d # b /\ r # b THEN "stuck"
  ELSE IF d # b THEN
    IF d = NONE THEN "drop" ELSE "push"
  ELSE
    IF r = NONE THEN "stuck" ELSE "pull"

ResetSync ==
  /\ syncPc' = "idle"
  /\ snapDoc' = NONE
  /\ snapLanded' = NONE
  /\ snapSubOk' = NONE
  /\ snapDrop' = FALSE
  /\ goneInRun' = FALSE
  /\ conflictInRun' = FALSE

\* Initial steady state: build submitted, approved (ok=1), landed on disk, and synced.
Init ==
  /\ disk = V1
  /\ base = V1
  /\ doc = V1
  /\ landed = V1
  /\ subOk = V1
  /\ dropSub = "none"
  /\ syncPc = "idle"
  /\ snapDoc = NONE
  /\ snapLanded = NONE
  /\ snapSubOk = NONE
  /\ snapDrop = FALSE
  /\ goneInRun = FALSE
  /\ conflictInRun = FALSE
  /\ sweptClean = FALSE
  /\ silentOverwrite = FALSE
  /\ unilateralLocalDel = FALSE

\* ── Online editor actions (functions/api/index.js) — can interleave at any syncPc ──

\* index.js:785-799 bsave: updates docs[id].md without touching landed.
EditorBsave ==
  /\ \/ (doc = V1 /\ doc' = VR1)
     \/ (doc = VR1 /\ doc' = VR2)
  /\ UNCHANGED <<disk, base, landed, subOk, dropSub, syncPc,
                 snapDoc, snapLanded, snapSubOk, snapDrop,
                 goneInRun, conflictInRun, sweptClean, silentOverwrite, unilateralLocalDel>>

\* index.js:824-841 bdrop: submits a pending deletion request for an existing build doc.
EditorBdrop ==
  /\ doc # NONE
  /\ dropSub = "none"
  /\ dropSub' = "pending"
  /\ UNCHANGED <<disk, base, doc, landed, subOk, syncPc,
                 snapDoc, snapLanded, snapSubOk, snapDrop,
                 goneInRun, conflictInRun, sweptClean, silentOverwrite, unilateralLocalDel>>

\* index.js:843-912 smark(ok=1) on a pending deletion request.
EditorApproveDrop ==
  /\ dropSub = "pending"
  /\ dropSub' = "approved"
  /\ UNCHANGED <<disk, base, doc, landed, subOk, syncPc,
                 snapDoc, snapLanded, snapSubOk, snapDrop,
                 goneInRun, conflictInRun, sweptClean, silentOverwrite, unilateralLocalDel>>

\* ── Local author actions (when sync.py is not running) ──

LocalEdit ==
  /\ syncPc = "idle"
  /\ disk = V1
  /\ disk' = VL
  /\ UNCHANGED <<base, doc, landed, subOk, dropSub, syncPc,
                 snapDoc, snapLanded, snapSubOk, snapDrop,
                 goneInRun, conflictInRun, sweptClean, silentOverwrite, unilateralLocalDel>>

LocalDelete ==
  /\ syncPc = "idle"
  /\ disk # NONE
  /\ disk' = NONE
  /\ UNCHANGED <<base, doc, landed, subOk, dropSub, syncPc,
                 snapDoc, snapLanded, snapSubOk, snapDrop,
                 goneInRun, conflictInRun, sweptClean, silentOverwrite, unilateralLocalDel>>

\* ── sync.py:sync() stages (tools/sync.py:509-606) ──

SyncSnapshot ==
  /\ syncPc = "idle"
  /\ syncPc' = "snap"
  /\ snapDoc' = doc
  /\ snapLanded' = landed
  /\ snapSubOk' = subOk
  /\ snapDrop' = (dropSub = "approved")
  /\ goneInRun' = FALSE
  /\ conflictInRun' = FALSE
  /\ UNCHANGED <<disk, base, doc, landed, subOk, dropSub, sweptClean, silentOverwrite, unilateralLocalDel>>

SweepConflict ==
  /\ syncPc = "snap"
  /\ snapDrop = TRUE
  /\ LET localDirty == disk # NONE /\ (base = NONE \/ disk # base)
         remoteDirty == snapDoc # NONE /\ (base = NONE \/ snapDoc # base)
     IN  /\ (localDirty \/ remoteDirty)
         /\ conflictInRun' = TRUE
         /\ syncPc' = "after_sweep"
         /\ UNCHANGED <<disk, base, doc, landed, subOk, dropSub,
                        snapDoc, snapLanded, snapSubOk, snapDrop,
                        goneInRun, sweptClean, silentOverwrite, unilateralLocalDel>>

SweepDropTxOk ==
  /\ syncPc = "snap"
  /\ snapDrop = TRUE
  /\ LET localDirty == disk # NONE /\ (base = NONE \/ disk # base)
         remoteDirty == snapDoc # NONE /\ (base = NONE \/ snapDoc # base)
     IN  /\ ~(localDirty \/ remoteDirty)
         /\ doc = snapDoc
         /\ doc' = NONE
         /\ landed' = NONE
         /\ syncPc' = "drop_doc_done"
         /\ UNCHANGED <<disk, base, subOk, dropSub,
                        snapDoc, snapLanded, snapSubOk, snapDrop,
                        goneInRun, conflictInRun, sweptClean, silentOverwrite, unilateralLocalDel>>

SweepDropTxConflict ==
  /\ syncPc = "snap"
  /\ snapDrop = TRUE
  /\ LET localDirty == disk # NONE /\ (base = NONE \/ disk # base)
         remoteDirty == snapDoc # NONE /\ (base = NONE \/ snapDoc # base)
     IN  /\ ~(localDirty \/ remoteDirty)
         /\ doc # snapDoc
         /\ ResetSync
         /\ UNCHANGED <<disk, base, doc, landed, subOk, dropSub, sweptClean, silentOverwrite, unilateralLocalDel>>

SweepDropCleanupSubs ==
  /\ syncPc = "drop_doc_done"
  /\ subOk' = NONE
  /\ dropSub' = IF dropSub = "approved" THEN "none" ELSE dropSub
  /\ syncPc' = "drop_subs_done"
  /\ UNCHANGED <<disk, base, doc, landed,
                 snapDoc, snapLanded, snapSubOk, snapDrop,
                 goneInRun, conflictInRun, sweptClean, silentOverwrite, unilateralLocalDel>>

SweepDropCrashBeforeSubs ==
  /\ syncPc = "drop_doc_done"
  /\ ResetSync
  /\ UNCHANGED <<disk, base, doc, landed, subOk, dropSub, sweptClean, silentOverwrite, unilateralLocalDel>>

SweepRemoveLocal ==
  /\ syncPc = "drop_subs_done"
  /\ unilateralLocalDel' = (unilateralLocalDel \/ (disk # NONE /\ (base = NONE \/ disk # base)))
  /\ disk' = NONE
  /\ base' = NONE
  /\ goneInRun' = TRUE
  /\ sweptClean' = TRUE
  /\ syncPc' = "after_sweep"
  /\ UNCHANGED <<doc, landed, subOk, dropSub,
                 snapDoc, snapLanded, snapSubOk, snapDrop,
                 conflictInRun, silentOverwrite>>

SweepCrashBeforeLocal ==
  /\ syncPc = "drop_subs_done"
  /\ ResetSync
  /\ UNCHANGED <<disk, base, doc, landed, subOk, dropSub, sweptClean, silentOverwrite, unilateralLocalDel>>

SweepSkip ==
  /\ syncPc = "snap"
  /\ snapDrop = FALSE
  /\ syncPc' = "after_sweep"
  /\ UNCHANGED <<disk, base, doc, landed, subOk, dropSub,
                 snapDoc, snapLanded, snapSubOk, snapDrop,
                 goneInRun, conflictInRun, sweptClean, silentOverwrite, unilateralLocalDel>>

LandAndFinishNoPull ==
  /\ syncPc = "after_sweep"
  /\ LET landedDisk ==
           IF snapSubOk # NONE /\ ~goneInRun /\ ~conflictInRun /\ disk = NONE
           THEN snapSubOk ELSE disk
         r == IF goneInRun THEN NONE ELSE snapDoc
         act == IF conflictInRun THEN "skip" ELSE Plan(landedDisk, r, base)
     IN  /\ act # "pull"
         /\ CASE act = "skip" \/ act = "stuck" ->
                /\ disk' = landedDisk
                /\ ResetSync
                /\ UNCHANGED <<base, doc, landed, subOk, dropSub, sweptClean, silentOverwrite, unilateralLocalDel>>
            [] act = "same" ->
                IF landedDisk # NONE /\ snapLanded # landedDisk THEN
                  IF doc # NONE THEN
                    /\ disk' = landedDisk
                    /\ landed' = landedDisk
                    /\ base' = landedDisk
                    /\ ResetSync
                    /\ UNCHANGED <<doc, subOk, dropSub, sweptClean, silentOverwrite, unilateralLocalDel>>
                  ELSE
                    /\ disk' = landedDisk
                    /\ ResetSync
                    /\ UNCHANGED <<base, doc, landed, subOk, dropSub, sweptClean, silentOverwrite, unilateralLocalDel>>
                ELSE
                  /\ disk' = landedDisk
                  /\ base' = landedDisk
                  /\ ResetSync
                  /\ UNCHANGED <<doc, landed, subOk, dropSub, sweptClean, silentOverwrite, unilateralLocalDel>>
            [] act = "push" ->
                IF doc = r THEN
                  /\ disk' = landedDisk
                  /\ doc' = landedDisk
                  /\ landed' = landedDisk
                  /\ base' = landedDisk
                  /\ ResetSync
                  /\ UNCHANGED <<subOk, dropSub, sweptClean, silentOverwrite, unilateralLocalDel>>
                ELSE
                  /\ disk' = landedDisk
                  /\ ResetSync
                  /\ UNCHANGED <<base, doc, landed, subOk, dropSub, sweptClean, silentOverwrite, unilateralLocalDel>>
            [] act = "drop" ->
                IF doc = r THEN
                  /\ disk' = landedDisk
                  /\ doc' = NONE
                  /\ landed' = NONE
                  /\ subOk' = NONE
                  /\ dropSub' = IF dropSub = "approved" THEN "none" ELSE dropSub
                  /\ base' = NONE
                  /\ ResetSync
                  /\ UNCHANGED <<sweptClean, silentOverwrite, unilateralLocalDel>>
                ELSE
                  /\ disk' = landedDisk
                  /\ ResetSync
                  /\ UNCHANGED <<base, doc, landed, subOk, dropSub, sweptClean, silentOverwrite, unilateralLocalDel>>

LandAndPullWriteDisk ==
  /\ syncPc = "after_sweep"
  /\ ~conflictInRun
  /\ LET landedDisk ==
           IF snapSubOk # NONE /\ ~goneInRun /\ ~conflictInRun /\ disk = NONE
           THEN snapSubOk ELSE disk
         r == IF goneInRun THEN NONE ELSE snapDoc
     IN  /\ Plan(landedDisk, r, base) = "pull"
         /\ disk' = r
         /\ syncPc' = "pulled_disk"
         /\ UNCHANGED <<base, doc, landed, subOk, dropSub,
                        snapDoc, snapLanded, snapSubOk, snapDrop,
                        goneInRun, conflictInRun, sweptClean, silentOverwrite, unilateralLocalDel>>

PullCommitLanded ==
  /\ syncPc = "pulled_disk"
  /\ IF snapLanded # disk THEN
       IF doc # NONE THEN
         /\ landed' = disk
         /\ base' = disk
         /\ ResetSync
         /\ UNCHANGED <<disk, doc, subOk, dropSub, sweptClean, silentOverwrite, unilateralLocalDel>>
       ELSE
         /\ ResetSync
         /\ UNCHANGED <<disk, base, doc, landed, subOk, dropSub, sweptClean, silentOverwrite, unilateralLocalDel>>
     ELSE
       /\ base' = disk
       /\ ResetSync
       /\ UNCHANGED <<disk, doc, landed, subOk, dropSub, sweptClean, silentOverwrite, unilateralLocalDel>>

\* ── Conflict resolution: tools/sync.py:649-676 take_docs(ids, mine=True) ──
\* sync.py:650-655 loads snapshot; sync.py:674 calls send(doc_id, disk[doc_id]) WITHOUT base_hash.

TakeMineLoad ==
  /\ syncPc = "idle"
  /\ disk # NONE
  /\ Plan(disk, doc, base) = "stuck"
  /\ syncPc' = "take_mine_loaded"
  /\ snapDoc' = doc
  /\ snapLanded' = landed
  /\ snapSubOk' = subOk
  /\ snapDrop' = (dropSub = "approved")
  /\ goneInRun' = FALSE
  /\ conflictInRun' = FALSE
  /\ UNCHANGED <<disk, base, doc, landed, subOk, dropSub, sweptClean, silentOverwrite, unilateralLocalDel>>

TakeMineSend ==
  /\ syncPc = "take_mine_loaded"
  \* If doc changed AFTER TakeMineLoad (doc # snapDoc), send() without base_hash
  \* unconditionally overwrites the unseen concurrent remote edit!
  /\ silentOverwrite' = (silentOverwrite \/ (doc # snapDoc /\ doc # NONE))
  /\ doc' = disk
  /\ landed' = disk
  /\ base' = disk
  /\ dropSub' = IF snapDrop THEN "none" ELSE dropSub
  /\ ResetSync
  /\ UNCHANGED <<disk, subOk, sweptClean, unilateralLocalDel>>

Next ==
  \/ EditorBsave
  \/ EditorBdrop
  \/ EditorApproveDrop
  \/ LocalEdit
  \/ LocalDelete
  \/ SyncSnapshot
  \/ SweepConflict
  \/ SweepDropTxOk
  \/ SweepDropTxConflict
  \/ SweepDropCleanupSubs
  \/ SweepDropCrashBeforeSubs
  \/ SweepRemoveLocal
  \/ SweepCrashBeforeLocal
  \/ SweepSkip
  \/ LandAndFinishNoPull
  \/ LandAndPullWriteDisk
  \/ PullCommitLanded
  \/ TakeMineLoad
  \/ TakeMineSend

Spec == Init /\ [][Next]_vars

\* ── Safety Invariants ──

TypeOK ==
  /\ disk \in Versions
  /\ base \in Versions
  /\ doc \in Versions
  /\ landed \in Versions
  /\ subOk \in Versions
  /\ dropSub \in {"none", "pending", "approved"}
  /\ syncPc \in {"idle", "snap", "drop_doc_done", "drop_subs_done",
                 "after_sweep", "pulled_disk", "take_mine_loaded"}

NoDeleteResurrection ==
  sweptClean => disk = NONE

NoSilentOverwrite ==
  ~silentOverwrite

NoUnilateralLocalDelete ==
  ~unilateralLocalDel

LandedConsistentAtSteadyState ==
  (syncPc = "idle" /\ disk # NONE /\ disk = doc /\ doc = base) => landed = doc

=============================================================================
