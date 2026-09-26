# Known bugs

Open defects, with what is understood about the cause. Fixed entries move to the CHANGELOG.

---

## BUG-2 — the ball's carry offset can jump when a carrier sets off

**Severity:** cosmetic, up to ~2.4 m, at one instant, and only when a carrier starts moving
across his attacking direction.

The carried ball sits `ballGlue` ahead of its carrier. `gluedTo` (`src/board/timeline.ts`) takes
"ahead" from where he will be 30 ms later; a carrier standing still has no direction, so it falls
back to the way his team attacks (`facingOf`). The first frame he moves, the offset snaps from
facing to his direction of travel — up to `ballGlue * sqrt(2)` if he sets off sideways.

There is no direction that is continuous everywhere, since a standing player has none. Options,
in order of preference:

1. While he stands, keep the direction of his last run into the current scene, so the ball
   points the way he was last going. Removes the seam at the end of a run, not at the start of
   the next.
2. Ease the direction over a short window instead of switching.
3. Always offset by `facingOf` — simplest, and the ball trails oddly when he runs backwards.
