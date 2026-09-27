/**
 * Marking shapes more than one court draws. Each works in a local frame where the goal
 * line is x = 0 and the court runs away from it along +x, so one path serves both ends:
 * the caller translates to the goal line and mirrors for the far one (`atEachEnd`).
 */

import type { Ctx } from "./pitch";

/**
 * Run `draw` once per end, in the local frame: `dir` is +1 at the near end and -1 at the
 * far one, and inside `draw` the court always runs along +x from the goal line.
 */
export function atEachEnd(ctx: Ctx, length: number, draw: (dir: 1 | -1) => void): void {
  for (const dir of [1, -1] as const) {
    ctx.save();
    ctx.translate(dir === 1 ? 0 : length, 0);
    ctx.scale(dir, 1);
    draw(dir);
    ctx.restore();
  }
}

/**
 * The goal area of handball, the penalty area of futsal and the shooting circle of hockey:
 * a quarter circle of `radius` about each post, joined by a straight line across the front
 * of the goal.
 * Traced from the goal line on one side round to the goal line on the other, so it can
 * be stroked as a line or closed along the goal line and filled.
 */
export function traceGoalArc(ctx: Ctx, cy: number, halfGoal: number, radius: number): void {
  ctx.moveTo(0, cy - halfGoal - radius);
  ctx.arc(0, cy - halfGoal, radius, -Math.PI / 2, 0);
  ctx.lineTo(radius, cy + halfGoal);
  ctx.arc(0, cy + halfGoal, radius, 0, Math.PI / 2);
}
