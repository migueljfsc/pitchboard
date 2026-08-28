# Known bugs

Open defects, with what is understood about the cause. Fixed entries move to the CHANGELOG.

---

## BUG-1 — a pass to a moving receiver curves like a homing missile

**Reported:** after M3, from using the board.
**Severity:** wrong-looking output on a common case. Not a crash, not data loss.

### Symptom

Give a player the ball in one scene and hand it to a different player in the next. If the
receiver is also moving during that transition, the ball does not travel like a pass — it bends
through the air, following the receiver around rather than being struck to a point.

### Cause

`ballAt` in `src/board/timeline.ts` resolves BOTH ends of a pass live:

```ts
const start = fromCarrier ? gluedTo(fromCarrier, r, doc) : ...
const end   = toCarrier   ? gluedTo(toCarrier,   r, doc) : ...
return lerpVec(start, end, easeOutQuad(r.u));
```

Because `end` is re-evaluated every frame from the receiver's *current* interpolated position,
the target moves while the ball is in flight and the ball tracks it. The interpolation between
two moving anchors traces a curve, not a line.

This was a deliberate choice made during M2, and it was the wrong one. It was picked to
guarantee the ball arrives exactly on the receiver with no jump at the handoff — which it does —
but a real pass is struck once, travels straight, and the receiver runs onto it.

### Fix

Evaluate the pass target ONCE, at the arrival instant, and hold the line:

- `end` should be the receiver's position at `u = 1` — the meeting point — not at the current `u`.
- `start` should be the passer's position at the moment of release, likewise fixed.
- Both endpoints still come from `positionAt`, so the receiver's own path and per-player timing
  are respected; only the sampling instant changes.

Endpoints stay continuous, because the receiver reaches that same point at `u = 1`.

### Do not regress

`src/board/timeline.test.ts` has "tracks a receiver who is moving during the pass, and lands
without a jump". That test asserts continuity at the handoff, which the fix preserves — but its
name and intent need updating to describe leading, not tracking. There is also a negative check
proving the naive "aim where they started" version fails; keep that.
