---
name: sync-protocol
description: "Formally verify the Destiny 2 Starside three-way sync and build lifecycle protocol across tools/sync.py and functions/api/index.js using TLA+ (TLC via /statechart) and Z3 + live-code quotient checks. Reach for this skill whenever changing tools/sync.py (plan, sweep, land, sync, sync_recs, _recs_commit, take_docs) or CloudBase sync/submission actions in functions/api/index.js (push, drop, landed, rpush, rdrop, bsave, bdrop, smark)."
---

# Formal Verification: Three-Way Sync & Build Lifecycle (`sync-protocol`)

This skill checks the safety promises of Starside's bidirectional sync between the local Git repository (`tools/sync.py`) and the CloudBase online editor (`functions/api/index.js`). A bug here silently destroys community edits, deletes local source files without intent, or resurrects deleted builds in an infinite loop.

## Properties Checked (Plain Words)

| Property | Promise | Harm if Broken | Tool |
|---|---|---|---|
| `plan(d, r, b)` safety (`P1`–`P8`) | Three-way comparison pushes only when remote matches baseline, pulls only when local matches baseline, drops only on intentional local delete, and reports `stuck` on every divergence or missing remote. | Local or remote edits are silently overwritten or local files are deleted when the database loses a record. | Z3 SMT + 64-class complete live-code quotient (`scripts/verify_sync.py`) |
| `NoDeleteResurrection` | Once an approved build deletion (`drop=1, ok=1`) finishes sweeping remote and local files, stale `ok=1` submissions never write the deleted build back to disk. | Deleted builds keep reappearing on every subsequent `sync.py` run. | TLA+ (`model/SyncProtocol.tla` via `/statechart`) |
| `NoSilentOverwrite` | No unseen local edit or concurrent online editor save (`bsave`) is overwritten without flagging a conflict. | A contributor's online edit vanishes silently with no conflict notice. | TLA+ + live replay (`scripts/verify_sync.py`) |
| `NoUnilateralLocalDelete` | A local file matching baseline is never deleted automatically just because the remote doc disappeared. | Transient DB loss wipes committed repository files. | TLA+ + Z3 `P5` |
| `LandedConsistentAtSteadyState` | Whenever sync is idle and local disk, CloudBase doc, and baseline match, `docs[id].landed` equals the content hash. | The admin console permanently shows a false "unlanded edit" indicator (or hides a real unlanded edit). | TLA+ |
| `sync_recs` `heads=True` `baseHash` | Record fast-path `rpush`/`rdrop` sends the stored SHA-1 hash from `rpull(heads=1)` as `baseHash`, not `sha1(hash)`. | Every local update or deletion of an existing record fails with spurious `conflict` in CloudBase. | Live-code contract check (`scripts/verify_sync.py`) |

## Coverage Record & Sync Commit

- **Last verified sync commit:** `48d35f42`
- **Covered files and functions:**
  - `tools/sync.py`: `plan()`, `recs_in_db()`, `sync_recs()`, `_recs_commit()`, `land()`, `deletions()`, `sweep()`, `sync()`, `take_docs()`
  - `functions/api/index.js`: `bsave`, `bdrop`, `smark`, `push` (`baseHash`), `drop` (`baseHash` + post-tx `subs` cleanup), `landed`, `rpush`, `rdrop`

Before trusting a pass, check whether any covered file changed after the sync commit:

```bash
git diff --stat 48d35f42..HEAD -- tools/sync.py functions/api/index.js
```

Only move the sync commit above forward after you confirm that `model/SyncProtocol.tla` and `scripts/verify_sync.py` still accurately describe every covered function at the new commit.

## How to Run

### 1. Z3 SMT Proof + Live-Code Checks (`tools/sync.py`)

Run from the repository root (takes < 1 s; requires `python3` with `z3` installed):

```bash
python3 .agents/skills/sync-protocol/scripts/verify_sync.py
```

Exit code `0` means every Z3 property, all 64 canonical quotient cases of `tools/sync.py:plan`, and every live-code contract/replay check passed. Exit code `1` prints each violated property or live finding.

### 2. TLA+ Model Check (Concurrency & Crash Interleavings)

Check `model/SyncProtocol.tla` (with config `model/SyncProtocol.cfg` and view `model/SyncProtocol.view.mjs`) using the **`/statechart`** skill, writing output to a fresh scratch directory outside the repo (e.g., `/tmp/starside-sync-chart-<timestamp>`).

Always read every TLA+ result through `/statechart`:
- When an invariant breaks, `/statechart` reports the shortest counterexample path in plain words and draws the bug path as a Mermaid statechart.
- When all invariants hold and the state graph is within budget, `/statechart` draws the full protocol statechart; above 500 states it still checks every rule and reports the exact state count.
- If `mise` is absent on this machine, pass the local `TLA2TOOLS` (`~/.cache/statechart/tla2tools.jar`) and `JAVA` (`$(command -v java)`) environment variables when invoking `/statechart`.

## Scope, Bounds, and Assumptions

- **What is verified:**
  - `plan(d, r, b)` is proved over **unbounded** hashes (`Int >= 0`) in Z3, and `tools/sync.py:plan` is tested on the complete 64-tuple equality quotient (`{None, 'h1', 'h2', 'h3'}^3`), which covers every possible string hash tuple.
  - `SyncProtocol.tla` exhaustively checks all reachable interleavings (1,538 states) of 1 build document across initial version `v1`, local edit `vl`, two sequential online edits `vr1 -> vr2`, local delete, `bdrop`/`smark(ok=1)` approval, `sync()` snapshot/sweep/land/reconcile stages, post-tx crashes in `drop` (`index.js:1457 -> 1464`) and local delete (`sync.py:498`), and `take_docs(--mine)`.
- **What is left out:**
  - Multi-document cross-file interactions, CloudBase pagination/network timeouts, `rpush`/`rdrop` per-record non-transactional TOCTOU interleavings (not yet in the TLA+ model), `take_docs(--theirs)`, and `smark` non-transactional slug duplicate check (`index.js:889-893`).
  - `verify_sync.py` stubs the CloudBase HTTP boundary (`sync.api`) with exact `index.js` CAS semantics rather than calling production CloudBase.

## Telling a Real Bug from a Modeling Error

1. **Replay every TLA+ counterexample against real code.** Map each step in the `/statechart` trace back to the cited lines in `tools/sync.py` and `functions/api/index.js` and run a minimal Python/Node repro. If the real code refuses a transition that the model allowed, tighten the model to match the real guard and re-run.
2. **Never weaken an invariant to make TLC pass.** If the replay reproduces the failure in real code, keep the invariant intact and report the bug (or fix the product code if the user asked for a fix, then re-verify).
3. **Updating after an intentional protocol change:** update the affected action in `model/SyncProtocol.tla` (and its label in `model/SyncProtocol.view.mjs`) or the spec in `scripts/verify_sync.py`, re-run both checks, confirm each invariant still catches a deliberate broken variant, and then update **Last verified sync commit** above.

## Known Findings at Sync Commit `48d35f42`

Both findings below are reproduced directly on live code at `48d35f42` and are intentionally left failing until product code is fixed:

1. **`NoSilentOverwrite` (`tools/sync.py:674`, `take_docs(--mine)`):** `take_docs()` calls `send(doc_id, disk[doc_id])` without `base_hash`, so `functions/api/index.js:1316-1317` skips the CAS transaction. If an online editor saves `vr2` after `take_docs()` pulls `vr1`, `--mine` silently overwrites `vr2` without conflict.
2. **`sync_recs` `heads=True` double-hash (`tools/sync.py:343-391`, `_recs_commit`):** When `recs_in_db(heads=True)` returns raw SHA-1 hashes and `need_bodies=False`, `_recs_commit` passes `sha1(db[rid])` to `rpush` (line 389) and `rdrop` (line 391), sending `sha1(sha1(json))` as `baseHash` instead of `sha1(json)`.
