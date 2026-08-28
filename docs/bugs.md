# Known bugs

Open defects, with what is understood about the cause. Fixed entries move to the CHANGELOG.

---

## BUG-2 — the ball's carry offset can jump when a scene starts

**Severity:** cosmetic, up to ~2.4 m, at one instant. Noticeable only if a carrier is moving.

### Symptom

The ball sits about 1.7 m from the player carrying it, offset along their direction of travel.
That direction is derived differently depending on what the timeline is doing:

- during a **hold**, there is no motion to sample, so it falls back to which way the team
  attacks (`facingOf`);
- during a **transition**, it comes from the carrier's actual velocity.

At the boundary between a hold and the transition that follows, the offset can therefore rotate
instantly. If the carrier sets off perpendicular to their attacking direction, the ball hops
around them by up to `ballGlue * sqrt(2)`.

### Cause

`gluedTo` in `src/board/timeline.ts` picks the direction per frame from `r.moving`, and the two
branches disagree at the seam.

### Fix

There is no single direction that is continuous everywhere, because a stationary player has no
direction at all. Options, roughly in order of preference:

1. Use the travel direction into the **current** scene during its hold, so the ball keeps
   pointing the way the player was last running. Removes the seam at the end of a transition,
   leaves one at the start of the next.
2. Ease the offset direction over a short window rather than switching instantly.
3. Drop the direction entirely and always offset by `facingOf`. Simplest, and the ball then
   trails oddly when a player runs backwards.

Not urgent: it is a static placement difference at one frame, not a defect in the movement.

### Noticed

While fixing BUG-1, which shared the same helper. Recorded rather than folded in, to keep that
change focused.
