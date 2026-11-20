#!/usr/bin/env python3
"""Formal verification checks against live tools/sync.py code.

1. Z3 SMT proof over unbounded integer hashes proving the 3-way reconciliation
   specification (P1–P8) is total, deterministic, and satisfies every safety property.
2. Exhaustive quotient check importing the real tools/sync.py:plan(d, r, b) across
   all 64 canonical equivalence classes ({None, 'h1', 'h2', 'h3'}^3), which is an exact
   complete quotient of ({None} U String)^3 under equality.
3. Live-code contract check of tools/sync.py:sync_recs() verifying that baseHash sent
   to rpush/rdrop in the heads=True fast path equals the stored SHA-1 hash rather than
   double-hashing sha1(hash).
4. Live-code replay of the TLC NoSilentOverwrite counterexample against
   tools/sync.py:take_docs([doc_id], mine=True), verifying whether push carries baseHash.
"""

from __future__ import annotations

import base64
import gzip
import importlib.util
import json
import pathlib
import sys
from unittest import mock

import z3

REPO_ROOT = pathlib.Path(__file__).resolve().parents[4]
SYNC_PY = REPO_ROOT / "tools" / "sync.py"
TOOLS_DIR = REPO_ROOT / "tools"


def load_sync_module():
    if str(TOOLS_DIR) not in sys.path:
        sys.path.insert(0, str(TOOLS_DIR))
    spec = importlib.util.spec_from_file_location("starside_sync_under_test", SYNC_PY)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def spec_action_z3(d: z3.ArithRef, r: z3.ArithRef, b: z3.ArithRef) -> z3.ArithRef:
    """Formal specification of plan(d, r, b) over unbounded hashes (0 == None, >0 == hash).

    Codes: 0=same, 1=push, 2=pull, 3=drop, 4=stuck.
    """
    return z3.If(
        d == r,
        0,
        z3.If(
            b == 0,
            z3.If(r == 0, 1, 4),
            z3.If(
                z3.And(d != b, r != b),
                4,
                z3.If(
                    d != b,
                    z3.If(d == 0, 3, 1),
                    z3.If(r == 0, 4, 2),
                ),
            ),
        ),
    )


def prove_plan_with_z3() -> list[str]:
    failures: list[str] = []
    d, r, b = z3.Ints("d r b")
    domain = z3.And(d >= 0, r >= 0, b >= 0)
    act = spec_action_z3(d, r, b)

    properties = [
        ("P1_Converged", z3.Implies(d == r, act == 0)),
        (
            "P2_NoSilentOverwriteOnPush",
            z3.Implies(act == 1, z3.And(d > 0, z3.Or(r == b, z3.And(b == 0, r == 0)))),
        ),
        (
            "P3_NoLocalClobberOnPull",
            z3.Implies(act == 2, z3.And(r > 0, b > 0, d == b, r != b)),
        ),
        (
            "P4_NoUnilateralRemoteDelete",
            z3.Implies(act == 3, z3.And(d == 0, b > 0, r == b, r > 0)),
        ),
        (
            "P5_NoUnilateralLocalDelete",
            z3.Implies(z3.And(d > 0, r == 0, d == b), act == 4),
        ),
        (
            "P6_TrueConflictAlwaysStuck",
            z3.Implies(z3.And(d != r, b > 0, d != b, r != b), act == 4),
        ),
        (
            "P7_UntrackedRemoteAlwaysStuck",
            z3.Implies(z3.And(b == 0, r > 0, d != r), act == 4),
        ),
        ("P8_ValidActionRange", z3.And(act >= 0, act <= 4)),
    ]

    for name, prop in properties:
        s = z3.Solver()
        s.add(domain)
        s.add(z3.Not(prop))
        res = s.check()
        if res != z3.unsat:
            failures.append(f"Z3 {name} FAILED: counterexample {s.model()}")
        else:
            print(f"  [Z3 PASS] {name}")
    return failures


def check_live_plan_quotient(sync_mod) -> list[str]:
    """Check all 64 canonical tuples against Z3 spec (complete quotient under equality)."""
    code_to_name = {0: "same", 1: "push", 2: "pull", 3: "drop", 4: "stuck"}
    vals = [(0, None), (1, "h1"), (2, "h2"), (3, "h3")]
    failures: list[str] = []
    for di, dv in vals:
        for ri, rv in vals:
            for bi, bv in vals:
                expected_code = z3.simplify(
                    spec_action_z3(z3.IntVal(di), z3.IntVal(ri), z3.IntVal(bi))
                ).as_long()
                expected = code_to_name[expected_code]
                actual = sync_mod.plan(dv, rv, bv)
                if actual != expected:
                    failures.append(
                        f"plan({dv!r}, {rv!r}, {bv!r}) returned {actual!r}, expected {expected!r}"
                    )
    if not failures:
        print(
            "  [LIVE PASS] tools/sync.py:plan matches Z3 spec on all 64 canonical quotient classes"
        )
    return failures


def check_sync_recs_heads_basehash(sync_mod) -> list[str]:
    """Verify sync_recs() in heads=True fast path sends raw stored hash (not sha1(hash)) as baseHash."""
    failures: list[str] = []
    rid = "traits/1001"
    old_json = '{"i18n/zh-CN/realgame_details":"old"}'
    new_json = '{"i18n/zh-CN/realgame_details":"new"}'
    old_hash = sync_mod.sha1(old_json)

    sent_push: list[list[str]] = []

    def fake_api_push(action, **kw):
        if action == "rpull":
            assert kw.get("heads") == 1, "expected heads=1 fast path"
            return {
                "recs": [{"_id": rid, "hash": old_hash, "landed": old_hash}],
                "more": 0,
            }
        if action == "rpush":
            rows = json.loads(gzip.decompress(base64.b64decode(kw["gz"])).decode())
            sent_push.extend(rows)
            return {"ok": 1, "n": len(rows)}
        if action == "rlanded":
            return {"ok": 1}
        raise AssertionError(f"unexpected api call: {action} {kw}")

    with (
        mock.patch.object(sync_mod, "recs_on_disk", return_value={rid: new_json}),
        mock.patch.object(sync_mod, "api", side_effect=fake_api_push),
        mock.patch.object(sync_mod, "baseline", return_value=None),
    ):
        sync_mod.sync_recs({rid: old_hash})

    if not sent_push:
        failures.append("sync_recs(push, heads=True): did not emit rpush")
    else:
        got_base = sent_push[0][2] if len(sent_push[0]) > 2 else None
        if got_base != old_hash:
            failures.append(
                f"FINDING sync_recs(push, heads=True): rpush sent baseHash={got_base!r} "
                f"instead of stored hash {old_hash!r} (double-hashed sha1(old_hash)={sync_mod.sha1(old_hash)!r})"
            )
        else:
            print("  [LIVE PASS] sync_recs(push, heads=True) baseHash == stored hash")

    sent_drop: list[list[str]] = []

    def fake_api_drop(action, **kw):
        if action == "rpull":
            return {
                "recs": [{"_id": rid, "hash": old_hash, "landed": old_hash}],
                "more": 0,
            }
        if action == "rdrop":
            sent_drop.extend(kw["items"])
            return {"ok": 1}
        if action == "rlanded":
            return {"ok": 1}
        raise AssertionError(f"unexpected api call: {action} {kw}")

    with (
        mock.patch.object(sync_mod, "recs_on_disk", return_value={}),
        mock.patch.object(sync_mod, "api", side_effect=fake_api_drop),
        mock.patch.object(sync_mod, "baseline", return_value=None),
    ):
        sync_mod.sync_recs({rid: old_hash})

    if not sent_drop:
        failures.append("sync_recs(drop, heads=True): did not emit rdrop")
    else:
        got_base = sent_drop[0][1]
        if got_base != old_hash:
            failures.append(
                f"FINDING sync_recs(drop, heads=True): rdrop sent baseHash={got_base!r} "
                f"instead of stored hash {old_hash!r} (double-hashed sha1(old_hash)={sync_mod.sha1(old_hash)!r})"
            )
        else:
            print("  [LIVE PASS] sync_recs(drop, heads=True) baseHash == stored hash")

    return failures


def replay_take_docs_mine_cas(sync_mod) -> list[str]:
    """Replay TLC NoSilentOverwrite trace against tools/sync.py:take_docs([doc_id], mine=True).

    When remote changes between take_docs's pull() (vr1) and push() (vr2), push must carry
    baseHash=sha1(vr1) so CloudBase rejects the stale overwrite instead of clobbering vr2.
    """
    failures: list[str] = []
    doc_id = "docs/sample"
    v1 = "# sample\nv1\n"
    vl = "# sample\nlocal edit\n"
    vr1 = "# sample\nremote edit 1\n"
    vr2 = "# sample\nremote edit 2 (concurrent)\n"

    remote_state = {"md": vr1, "hash": sync_mod.sha1(vr1), "landed": sync_mod.sha1(v1)}
    push_calls: list[dict] = []

    def fake_api(action, **kw):
        if action == "pull":
            return {"docs": [{"_id": doc_id, **remote_state}]}
        if action == "list":
            # Concurrent online editor saves vr2 right after take_docs pulled vr1.
            remote_state["md"] = vr2
            remote_state["hash"] = sync_mod.sha1(vr2)
            return {"subs": []}
        if action == "push":
            push_calls.append(kw)
            # Mirror functions/api/index.js:1302-1318 exact CAS semantics.
            if "baseHash" in kw:
                if remote_state["hash"] != kw["baseHash"]:
                    raise RuntimeError("conflict")
            remote_state["md"] = gzip.decompress(base64.b64decode(kw["gz"])).decode()
            remote_state["hash"] = sync_mod.sha1(remote_state["md"])
            return {"ok": 1}
        raise AssertionError(f"unexpected api call: {action} {kw}")

    cas_rejected = False
    with (
        mock.patch.object(sync_mod, "api", side_effect=fake_api),
        mock.patch.object(sync_mod, "on_disk", return_value={doc_id: vl}),
        mock.patch.object(
            sync_mod, "baseline", return_value={doc_id: sync_mod.sha1(v1)}
        ),
        mock.patch.object(
            sync_mod, "path_of", return_value="/tmp/nonexistent-starside-sample.md"
        ),
    ):
        try:
            sync_mod.take_docs([doc_id], mine=True)
        except RuntimeError as exc:
            if "conflict" in str(exc):
                cas_rejected = True
            else:
                raise

    if (
        cas_rejected
        and len(push_calls) == 1
        and push_calls[0].get("baseHash") == sync_mod.sha1(vr1)
        and remote_state["md"] == vr2
    ):
        print(
            "  [LIVE PASS] take_docs(--mine) sent push with baseHash=sha1(vr1), "
            "CAS rejected concurrent remote edit, and remote stayed vr2"
        )
        return failures

    if remote_state["md"] == vl:
        failures.append(
            "FINDING take_docs(--mine): replay confirmed TLC counterexample — "
            f"push omitted baseHash (keys={sorted(push_calls[0].keys()) if push_calls else []}) "
            "and silently overwrote concurrent remote edit vr2 with local edit vl"
        )
    else:
        failures.append(
            "take_docs(--mine) replay did not exercise expected CAS rejection: "
            f"cas_rejected={cas_rejected}, push_calls={len(push_calls)}, "
            f"baseHash={push_calls[0].get('baseHash') if push_calls else None}, "
            f"remote_is_vr2={remote_state['md'] == vr2}"
        )
    return failures


def main() -> int:
    sync_mod = load_sync_module()
    failures: list[str] = []
    failures.extend(prove_plan_with_z3())
    failures.extend(check_live_plan_quotient(sync_mod))
    failures.extend(check_sync_recs_heads_basehash(sync_mod))
    failures.extend(replay_take_docs_mine_cas(sync_mod))
    if failures:
        print("\nFORMAL CHECK FAILURES / FINDINGS:", file=sys.stderr)
        for msg in failures:
            print(f"  - {msg}", file=sys.stderr)
        return 1
    print("\nAll Z3 + live-code sync checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
