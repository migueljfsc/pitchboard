import { describe, expect, it } from "vitest";
import {
  DEFAULT_HOLD_MS,
  addSceneAfter,
  ballTravelBetween,
  canLoft,
  canShoot,
  highlightOf,
  isHighlighted,
  isRunHidden,
  defaultCurve,
  deleteScene,
  pruneBallFlags,
  duplicateScene,
  moveScene,
  renameScene,
  ballCurve,
  pathOf,
  sceneStartSeconds,
  setCarrier,
  setHighlight,
  setLoft,
  setPath,
  setRunHidden,
  setSceneTiming,
  setShot,
  totalSeconds,
} from "./scenes";
import { boardDocSchema } from "./schema";
import { createBoardDoc } from "@/formations";
import { distanceToSegment } from "./geometry";
import { transitionInto } from "./timeline";
import { BALL_ID } from "./types";
import type { BoardDoc } from "./types";

const base = () => createBoardDoc();
/** The same board with a ball on the grass in every scene; a fresh one has none. */
const loose = (doc: BoardDoc): BoardDoc => ({
  ...doc,
  scenes: doc.scenes.map((s) => ({ ...s, carrier: null, ballPos: { x: 52.5, y: 34 } })),
});

/** A board of `n` scenes, each a copy of the one before — a board just laid out. */
const scenes = (n: number): BoardDoc => {
  let doc = base();
  for (let i = 1; i < n; i++) doc = addSceneAfter(doc, i - 1);
  return doc;
};
const HOME_9 = "home-9";
const HOME_10 = "home-10";
const valid = (doc: BoardDoc) => boardDocSchema.safeParse(doc).success;

describe("addSceneAfter", () => {
  it("inserts a scene carrying the previous positions forward", () => {
    const doc = base();
    const next = addSceneAfter(doc, 0);
    expect(next.scenes).toHaveLength(2);
    expect(next.scenes[1].positions).toEqual(doc.scenes[0].positions);
    expect(next.scenes[1].holdMs).toBe(DEFAULT_HOLD_MS);
    expect(valid(next)).toBe(true);
  });

  it("clears paths — the new scene is where the old one already was", () => {
    let doc = base();
    doc = addSceneAfter(doc, 0);
    doc = setPath(doc, 1, HOME_9, { c1: { x: 10, y: 10 }, c2: { x: 20, y: 20 } });
    const next = addSceneAfter(doc, 1);
    expect(next.scenes[2].paths).toEqual({});
  });

  it("gives every scene a distinct id", () => {
    let doc = base();
    for (let i = 0; i < 5; i++) doc = addSceneAfter(doc, doc.scenes.length - 1);
    expect(new Set(doc.scenes.map((s) => s.id)).size).toBe(doc.scenes.length);
  });

  it("is a no-op for an index that does not exist", () => {
    const doc = base();
    expect(addSceneAfter(doc, 9)).toBe(doc);
  });
});

describe("duplicateScene", () => {
  it("copies paths as well as positions", () => {
    let doc = addSceneAfter(base(), 0);
    doc = setPath(doc, 1, HOME_9, { c1: { x: 10, y: 10 }, c2: { x: 20, y: 20 } });
    const next = duplicateScene(doc, 1);
    expect(next.scenes[2].paths[HOME_9]).toEqual(doc.scenes[1].paths[HOME_9]);
    expect(valid(next)).toBe(true);
  });

  it("deep-copies, so editing the copy leaves the original alone", () => {
    let doc = addSceneAfter(base(), 0);
    doc = duplicateScene(doc, 1);
    const before = doc.scenes[1].positions[HOME_9].x;
    doc.scenes[2].positions[HOME_9].x = 99;
    expect(doc.scenes[1].positions[HOME_9].x).toBe(before);
  });
});

describe("deleteScene", () => {
  it("removes the scene and its paths together", () => {
    let doc = addSceneAfter(base(), 0);
    doc = setPath(doc, 1, HOME_9, { c1: { x: 1, y: 1 }, c2: { x: 2, y: 2 } });
    const next = deleteScene(doc, 1);
    expect(next.scenes).toHaveLength(1);
    expect(valid(next)).toBe(true);
  });

  it("refuses to delete the last remaining scene", () => {
    const doc = base();
    expect(deleteScene(doc, 0)).toBe(doc);
  });

  it("leaves a valid document when scene 0 goes", () => {
    const doc = addSceneAfter(base(), 0);
    const next = deleteScene(doc, 0);
    expect(next.scenes).toHaveLength(1);
    expect(valid(next)).toBe(true);
  });
});

describe("moveScene", () => {
  it("reorders", () => {
    let doc = addSceneAfter(base(), 0);
    doc = renameScene(doc, 1, "second");
    const next = moveScene(doc, 1, 0);
    expect(next.scenes[0].name).toBe("second");
    expect(valid(next)).toBe(true);
  });

  it("is a no-op for out-of-range or identical indices", () => {
    const doc = addSceneAfter(base(), 0);
    expect(moveScene(doc, 0, 0)).toBe(doc);
    expect(moveScene(doc, 0, 5)).toBe(doc);
    expect(moveScene(doc, -1, 0)).toBe(doc);
  });
});

describe("setSceneTiming", () => {
  it("sets each duration independently", () => {
    const doc = setSceneTiming(addSceneAfter(base(), 0), 1, { transitionMs: 2500 });
    expect(doc.scenes[1].transitionMs).toBe(2500);
    expect(doc.scenes[1].holdMs).toBe(DEFAULT_HOLD_MS);
  });

  it("clamps to a sane range and rounds to whole milliseconds", () => {
    const doc = addSceneAfter(base(), 0);
    expect(setSceneTiming(doc, 1, { holdMs: -400 }).scenes[1].holdMs).toBe(0);
    expect(setSceneTiming(doc, 1, { holdMs: 1e9 }).scenes[1].holdMs).toBe(60_000);
    expect(setSceneTiming(doc, 1, { holdMs: 1234.6 }).scenes[1].holdMs).toBe(1235);
  });
});

describe("timings", () => {
  it("puts a scene's rest point after every preceding hold and travel", () => {
    let doc = base();
    doc = setSceneTiming(doc, 0, { holdMs: 1000 });
    doc = addSceneAfter(doc, 0);
    doc = setSceneTiming(doc, 1, { transitionMs: 2000, holdMs: 500 });

    expect(sceneStartSeconds(doc, 0)).toBe(0);
    expect(sceneStartSeconds(doc, 1)).toBeCloseTo(3);
    expect(totalSeconds(doc)).toBeCloseTo(3.5);
  });
});

describe("setCarrier", () => {
  it("drops ballPos when a player takes the ball", () => {
    const doc = setCarrier(base(), 0, HOME_9);
    expect(doc.scenes[0].carrier).toBe(HOME_9);
    expect("ballPos" in doc.scenes[0]).toBe(false);
    expect(valid(doc)).toBe(true);
  });

  it("releases the ball where it currently is, not at some default", () => {
    let doc = setCarrier(base(), 0, HOME_9);
    const carried = doc.scenes[0].positions[HOME_9];
    doc = setCarrier(doc, 0, null);

    expect(doc.scenes[0].carrier).toBeNull();
    const dropped = doc.scenes[0].ballPos!;
    // Beside the player it left, so releasing never teleports the ball.
    expect(Math.hypot(dropped.x - carried.x, dropped.y - carried.y)).toBeLessThan(2.5);
    expect(valid(doc)).toBe(true);
  });

  it("stays valid handing the ball straight from one player to another", () => {
    let doc = setCarrier(base(), 0, HOME_9);
    doc = setCarrier(doc, 0, HOME_10);
    expect(doc.scenes[0].carrier).toBe(HOME_10);
    expect(valid(doc)).toBe(true);
  });

  it("is a no-op when nothing changes", () => {
    const doc = setCarrier(base(), 0, HOME_9);
    expect(setCarrier(doc, 0, HOME_9)).toBe(doc);
  });

  it("touches only this scene without a carry", () => {
    let doc = scenes(4);
    doc = setCarrier(doc, 1, HOME_9);
    expect(doc.scenes.map((s) => s.carrier)).toEqual([null, HOME_9, null, null]);
  });

  it("carries the handover into the following scenes nobody has touched", () => {
    let doc = scenes(4);
    doc = setCarrier(doc, 1, HOME_9, "stationary");
    expect(doc.scenes.map((s) => s.carrier)).toEqual([null, HOME_9, HOME_9, HOME_9]);
    // A scene holding the ball must not also hold a loose position for it.
    expect(doc.scenes.slice(1).every((s) => !("ballPos" in s))).toBe(true);
    expect(valid(doc)).toBe(true);
  });

  it("stops at a scene the ball was already given to somebody", () => {
    let doc = scenes(5);
    doc = setCarrier(doc, 3, HOME_10);
    doc = setCarrier(doc, 1, HOME_9, "stationary");
    // Scene 4 was never given the ball, so the stop at 3 leaves it as it was.
    expect(doc.scenes.map((s) => s.carrier)).toEqual([null, HOME_9, HOME_9, HOME_10, null]);
  });

  it("stops at a scene the ball was moved to a space", () => {
    let doc = scenes(4);
    doc.scenes[2] = { ...doc.scenes[2], ballPos: { x: 80, y: 20 } };
    doc = setCarrier(doc, 0, HOME_9, "stationary");
    expect(doc.scenes.map((s) => s.carrier)).toEqual([HOME_9, HOME_9, null, null]);
  });

  it("reaches no further on \"all\" than on \"stationary\" — a handover has no delta", () => {
    let doc = scenes(5);
    doc = setCarrier(doc, 3, HOME_10);
    const stationary = setCarrier(doc, 1, HOME_9, "stationary");
    const all = setCarrier(doc, 1, HOME_9, "all");
    expect(all.scenes.map((s) => s.carrier)).toEqual(stationary.scenes.map((s) => s.carrier));
  });

  it("carries a release forward, leaving the ball where it was put down", () => {
    let doc = scenes(3);
    doc = setCarrier(doc, 0, HOME_9, "stationary");
    doc = setCarrier(doc, 1, null, "stationary");

    expect(doc.scenes.map((s) => s.carrier)).toEqual([HOME_9, null, null]);
    // The same spot in both, rather than following the player through scene 2.
    expect(doc.scenes[2].ballPos).toEqual(doc.scenes[1].ballPos);
    expect(valid(doc)).toBe(true);
  });
});

describe("the ball's own curve", () => {
  /** A pass: HOME_9 has it, HOME_10 receives it a scene later. */
  const passed = () => {
    let doc = setCarrier(base(), 0, HOME_9);
    doc = addSceneAfter(doc, 0);
    return setCarrier(doc, 1, HOME_10);
  };
  // The travel INTO scene 1, which is where a ball's line lives — at rest
  // nothing is moving and there is no journey to bend.
  const into = (doc: BoardDoc) => transitionInto(doc, 1)!;

  it("kept in ballPath, never in paths — the ball has no run to hang one on", () => {
    const curve = { c1: { x: 40, y: 10 }, c2: { x: 60, y: 10 } };
    const doc = setPath(passed(), 1, BALL_ID, curve);

    expect(doc.scenes[1].ballPath).toEqual(curve);
    expect(doc.scenes[1].paths[BALL_ID]).toBeUndefined();
    expect(pathOf(doc.scenes[1], BALL_ID)).toEqual(curve);
    expect(valid(doc)).toBe(true);
  });

  it("straightens through the same door it was bent with", () => {
    let doc = setPath(passed(), 1, BALL_ID, { c1: { x: 40, y: 10 }, c2: { x: 60, y: 10 } });
    doc = setPath(doc, 1, BALL_ID, null);
    expect(doc.scenes[1].ballPath).toBeNull();
    expect(pathOf(doc.scenes[1], BALL_ID)).toBeNull();
  });

  it("offers a straight curve to bend before one is stored", () => {
    const doc = passed();
    const b = ballCurve(doc, into(doc))!;
    expect(b).not.toBeNull();
    // The synthesised controls sit on the line between the ends.
    expect(distanceToSegment(b.c1, b.p0, b.p1)).toBeLessThan(1e-6);
    expect(distanceToSegment(b.c2, b.p0, b.p1)).toBeLessThan(1e-6);
  });

  it("hands back the stored curve once one is drawn", () => {
    const curve = { c1: { x: 40, y: 10 }, c2: { x: 60, y: 10 } };
    const doc = setPath(passed(), 1, BALL_ID, curve);
    const b = ballCurve(doc, into(doc))!;
    expect(b.c1).toEqual(curve.c1);
    expect(b.c2).toEqual(curve.c2);
  });

  it("has no curve for a dribble — the ball is carried, not played", () => {
    let doc = setCarrier(base(), 0, HOME_9);
    doc = setCarrier(addSceneAfter(doc, 0), 1, HOME_9);
    expect(ballCurve(doc, into(doc))).toBeNull();
  });

  it("has no curve where there is no ball at all", () => {
    const doc = addSceneAfter(base(), 0);
    expect(ballCurve(doc, into(doc))).toBeNull();
  });
});

describe("setPath", () => {
  it("sets and clears a curve", () => {
    let doc = addSceneAfter(base(), 0);
    const curve = { c1: { x: 10, y: 10 }, c2: { x: 20, y: 20 } };
    doc = setPath(doc, 1, HOME_9, curve);
    expect(doc.scenes[1].paths[HOME_9]).toEqual(curve);

    doc = setPath(doc, 1, HOME_9, null);
    expect(HOME_9 in doc.scenes[1].paths).toBe(false);
    expect(valid(doc)).toBe(true);
  });
});

describe("defaultCurve", () => {
  it("bows off the straight line between the two points", () => {
    const from = { x: 0, y: 34 };
    const to = { x: 40, y: 34 };
    const { c1, c2 } = defaultCurve(from, to);
    expect(distanceToSegment(c1, from, to)).toBeGreaterThan(1);
    expect(distanceToSegment(c2, from, to)).toBeGreaterThan(1);
  });
});

describe("every operation leaves a valid document", () => {
  it("survives a long editing session", () => {
    let doc = base();
    doc = addSceneAfter(doc, 0);
    doc = setCarrier(doc, 0, HOME_9);
    doc = setCarrier(doc, 1, HOME_10);
    doc = setPath(doc, 1, HOME_9, { c1: { x: 20, y: 20 }, c2: { x: 30, y: 30 } });
    doc = duplicateScene(doc, 1);
    doc = addSceneAfter(doc, 2);
    doc = moveScene(doc, 3, 1);
    doc = setSceneTiming(doc, 2, { transitionMs: 800, holdMs: 200 });
    doc = renameScene(doc, 0, "Kickoff");
    doc = deleteScene(doc, 1);
    doc = setCarrier(doc, 1, null);

    const result = boardDocSchema.safeParse(doc);
    expect(result.success ? null : result.error.issues).toBeNull();
  });
});

describe("setRunHidden", () => {
  const twoScenes = () => addSceneAfter(base(), 0);

  it("hides one entity's arrow in one scene, and no other", () => {
    let doc = twoScenes();
    doc = setRunHidden(doc, 1, HOME_9, true);
    expect(isRunHidden(doc.scenes[1], HOME_9)).toBe(true);
    expect(isRunHidden(doc.scenes[1], HOME_10)).toBe(false);
    expect(isRunHidden(doc.scenes[0], HOME_9)).toBe(false);
    expect(valid(doc)).toBe(true);
  });

  it("drops the key once nothing is hidden, so the scene serialises as before", () => {
    let doc = twoScenes();
    doc = setRunHidden(doc, 1, HOME_9, true);
    doc = setRunHidden(doc, 1, HOME_9, false);
    expect("hiddenRuns" in doc.scenes[1]).toBe(false);
  });

  it("is a no-op when the entity is already in that state", () => {
    const doc = twoScenes();
    expect(setRunHidden(doc, 1, HOME_9, false)).toBe(doc);
    const hidden = setRunHidden(doc, 1, HOME_9, true);
    expect(setRunHidden(hidden, 1, HOME_9, true)).toBe(hidden);
  });

  it("hides the ball's line under the same key", () => {
    const doc = setRunHidden(twoScenes(), 1, "ball", true);
    expect(isRunHidden(doc.scenes[1], "ball")).toBe(true);
    expect(valid(doc)).toBe(true);
  });
});

describe("canShoot", () => {
  it("is false with no previous scene to travel from", () => {
    expect(canShoot(base(), 0)).toBe(false);
  });

  it("is false while the same player carries the ball throughout", () => {
    let doc = setCarrier(base(), 0, HOME_9);
    doc = addSceneAfter(doc, 0);
    expect(doc.scenes[1].carrier).toBe(HOME_9);
    expect(canShoot(doc, 1)).toBe(false);
  });

  it("is FALSE for a pass — a pass is the one thing a shot is not", () => {
    let doc = setCarrier(base(), 0, HOME_9);
    doc = addSceneAfter(doc, 0);
    doc = setCarrier(doc, 1, HOME_10);
    expect(canShoot(doc, 1)).toBe(false);
  });

  it("is true for a ball played to an OPPONENT — a keeper's save is still a shot", () => {
    let doc = setCarrier(base(), 0, HOME_9);
    doc = addSceneAfter(doc, 0);
    doc = setCarrier(doc, 1, doc.teams[1].players[0].id);
    expect(canShoot(doc, 1)).toBe(true);
  });

  it("is true for a loose ball that rolls, and false for one that does not", () => {
    const doc = loose(addSceneAfter(base(), 0));
    expect(canShoot(doc, 1)).toBe(false);
    const rolled = {
      ...doc,
      scenes: doc.scenes.map((s, i) => (i === 1 ? { ...s, ballPos: { x: 90, y: 34 } } : s)),
    };
    expect(canShoot(rolled, 1)).toBe(true);
  });

  it("is false where the ball first appears — arriving is not travelling", () => {
    const doc = setCarrier(addSceneAfter(base(), 0), 1, HOME_9);
    expect(canShoot(doc, 1)).toBe(false);
  });
});

describe("loft", () => {
  /** A pass into scene 1: HOME_9 has it, HOME_10 receives it. */
  const passed = () => {
    let doc = setCarrier(base(), 0, HOME_9);
    doc = addSceneAfter(doc, 0);
    return setCarrier(doc, 1, HOME_10);
  };

  it("is offered for a pass, where a shot is not", () => {
    const doc = passed();
    expect(canLoft(doc, 1)).toBe(true);
    expect(canShoot(doc, 1)).toBe(false);
  });

  it("is offered for a loose ball too", () => {
    let doc = setCarrier(base(), 0, HOME_9);
    doc = setCarrier(addSceneAfter(doc, 0), 1, null);
    expect(canLoft(doc, 1)).toBe(true);
  });

  it("is refused for a dribble, and on the first scene", () => {
    let doc = setCarrier(base(), 0, HOME_9);
    doc = setCarrier(addSceneAfter(doc, 0), 1, HOME_9);
    expect(canLoft(doc, 1)).toBe(false);
    expect(canLoft(doc, 0)).toBe(false);
  });

  it("sets and clears, and stays valid", () => {
    let doc = setLoft(passed(), 1, true);
    expect(doc.scenes[1].loft).toBe(true);
    expect(valid(doc)).toBe(true);

    doc = setLoft(doc, 1, false);
    expect("loft" in doc.scenes[1]).toBe(false);
  });

  it("is dropped when the travel it described stops existing", () => {
    const doc = setLoft(passed(), 1, true);
    // The receiver gives it back: a dribble, and nothing left to loft.
    const stalled = setCarrier(doc, 1, HOME_9);
    expect(stalled.scenes[1].loft).toBeUndefined();
  });

  it("survives alongside a shot — a chip at goal is both", () => {
    let doc = setCarrier(base(), 0, HOME_9);
    doc = setCarrier(addSceneAfter(doc, 0), 1, null);
    doc = setLoft(setShot(doc, 1, true), 1, true);
    expect([doc.scenes[1].shot, doc.scenes[1].loft]).toEqual([true, true]);
    expect(valid(doc)).toBe(true);
  });
});

describe("setShot", () => {
  /** A ball struck at goal: carried in scene 0, loose and moved in scene 1. */
  const struck = () => {
    let doc = setCarrier(base(), 0, HOME_9);
    doc = addSceneAfter(doc, 0);
    doc = setCarrier(doc, 1, null);
    const scenes = doc.scenes.slice();
    scenes[1] = { ...scenes[1], ballPos: { x: 100, y: 34 } };
    return { ...doc, scenes };
  };

  it("marks and unmarks the travel into a scene, dropping the key when off", () => {
    const doc = struck();
    expect(canShoot(doc, 1)).toBe(true);

    const shot = setShot(doc, 1, true);
    expect(shot.scenes[1].shot).toBe(true);
    expect(valid(shot)).toBe(true);
    expect("shot" in setShot(shot, 1, false).scenes[1]).toBe(false);
  });

  it("is a no-op when already in that state", () => {
    const doc = struck();
    expect(setShot(doc, 1, false)).toBe(doc);
  });

  it("refuses a scene the ball does not travel into", () => {
    // The toggle is disabled there, so this is only reachable by code — but a
    // flag that cannot be seen or cleared is exactly how one goes stale.
    const doc = addSceneAfter(base(), 0);
    expect(canShoot(doc, 1)).toBe(false);
    expect(setShot(doc, 1, true).scenes[1].shot).toBeUndefined();
  });
});

describe("a shot does not outlive the ball's travel", () => {
  /** Carried in 0, released and struck into 1. */
  const struck = () => {
    let doc = setCarrier(base(), 0, HOME_9);
    doc = addSceneAfter(doc, 0);
    doc = setCarrier(doc, 1, null);
    const scenes = doc.scenes.slice();
    scenes[1] = { ...scenes[1], ballPos: { x: 100, y: 34 } };
    return setShot({ ...doc, scenes }, 1, true);
  };

  it("clears when the ball is given to someone in that scene", () => {
    const doc = struck();
    expect(doc.scenes[1].shot).toBe(true);
    // The reported bug: handing the ball back leaves the strike behind.
    const held = setCarrier(doc, 1, HOME_9);
    expect(held.scenes[1].shot).toBeUndefined();
    expect(valid(held)).toBe(true);
  });

  it("clears when the ball is passed to a team-mate instead", () => {
    // The ball still travels, so a rule written around "does it move" would keep
    // the flag and draw a pass with a strike burst on it. A pass is the one
    // travel a shot cannot be (D24).
    const doc = struck();
    const passed = setCarrier(doc, 1, HOME_10);
    expect(passed.scenes[1].shot).toBeUndefined();
    expect(valid(passed)).toBe(true);
  });

  it("survives the ball reaching an opponent — that is a save, not a pass", () => {
    const doc = struck();
    const saved = setCarrier(doc, 1, doc.teams[1].players[0].id);
    expect(saved.scenes[1].shot).toBe(true);
  });

  it("clears when the PREVIOUS scene stops sending the ball", () => {
    // setCarrier on scene 0 changes what travels into scene 1, which is the
    // route a fix aimed only at the edited scene would miss.
    const doc = struck();
    const scenes = doc.scenes.slice();
    scenes[0] = { ...scenes[0], carrier: null, ballPos: { x: 100, y: 34 } };
    const stalled = { ...doc, scenes };
    expect(canShoot(stalled, 1)).toBe(false);
    expect(pruneBallFlags(stalled).scenes[1].shot).toBeUndefined();
  });

  it("clears on a scene that is no longer second", () => {
    const doc = struck();
    expect(deleteScene(doc, 0).scenes[0].shot).toBeUndefined();
  });

  it("leaves a genuine shot alone", () => {
    const doc = struck();
    expect(renameScene(doc, 1, "Strike").scenes[1].shot).toBe(true);
    expect(setSceneTiming(doc, 1, { holdMs: 500 }).scenes[1].shot).toBe(true);
  });
});

describe("ballTravelBetween", () => {
  const AWAY_9 = "away-9";
  const pair = (doc: BoardDoc) => ballTravelBetween(doc, doc.scenes[0], doc.scenes[1]);

  it("is none for a dribble — the same player carries it throughout", () => {
    let doc = setCarrier(base(), 0, HOME_9);
    doc = addSceneAfter(doc, 0);
    // The carrier runs; the ball goes with them, and that is their run.
    doc = {
      ...doc,
      scenes: doc.scenes.map((s, i) =>
        i === 1 ? { ...s, positions: { ...s.positions, [HOME_9]: { x: 80, y: 20 } } } : s,
      ),
    };
    expect(pair(doc)).toBe("none");
  });

  it("is a pass between team-mates", () => {
    let doc = setCarrier(base(), 0, HOME_9);
    doc = addSceneAfter(doc, 0);
    expect(pair(setCarrier(doc, 1, HOME_10))).toBe("pass");
  });

  it("is loose when the ball changes team — a turnover is not a pass", () => {
    let doc = setCarrier(base(), 0, HOME_9);
    doc = addSceneAfter(doc, 0);
    expect(pair(setCarrier(doc, 1, AWAY_9))).toBe("loose");
  });

  it("is loose when released, and loose when collected", () => {
    let doc = setCarrier(base(), 0, HOME_9);
    doc = addSceneAfter(doc, 0);
    expect(pair(setCarrier(doc, 1, null))).toBe("loose");

    let collected = loose(addSceneAfter(base(), 0));
    collected = setCarrier(collected, 1, HOME_9);
    expect(pair(collected)).toBe("loose");
  });

  it("is none where the ball first appears — it came from nowhere", () => {
    expect(pair(setCarrier(addSceneAfter(base(), 0), 1, HOME_9))).toBe("none");
  });

  it("is none for a loose ball nobody has moved", () => {
    expect(pair(addSceneAfter(base(), 0))).toBe("none");
  });
});

describe("setHighlight", () => {
  const AMBER = "#f59e0b";
  const BLUE = "#2563eb";

  it("lights a whole selection at once", () => {
    const doc = setHighlight(createBoardDoc(), 0, ["home-2", "home-5"], AMBER);
    expect(isHighlighted(doc.scenes[0], "home-2")).toBe(true);
    expect(isHighlighted(doc.scenes[0], "home-5")).toBe(true);
    expect(highlightOf(doc.scenes[0], "home-2")).toBe(AMBER);
  });

  it("recolours without unlighting", () => {
    let doc = setHighlight(createBoardDoc(), 0, ["home-2"], AMBER);
    doc = setHighlight(doc, 0, ["home-2"], BLUE);
    expect(highlightOf(doc.scenes[0], "home-2")).toBe(BLUE);
  });

  it("puts a selection out with null, and drops the key once nothing is lit", () => {
    let doc = setHighlight(createBoardDoc(), 0, ["home-2"], AMBER);
    doc = setHighlight(doc, 0, ["home-2"], null);
    expect(isHighlighted(doc.scenes[0], "home-2")).toBe(false);
    // Absent rather than empty, so a scene with nothing lit serialises exactly as
    // it did before the field existed.
    expect(doc.scenes[0].highlight).toBeUndefined();
  });

  it("leaves the others lit when one is put out", () => {
    let doc = setHighlight(createBoardDoc(), 0, ["home-2", "home-5"], AMBER);
    doc = setHighlight(doc, 0, ["home-2"], null);
    expect(isHighlighted(doc.scenes[0], "home-5")).toBe(true);
  });

  // Never carried forward: attention is about one moment, unlike a position (D47).
  it("touches only the scene it was given", () => {
    const two = addSceneAfter(createBoardDoc(), 0);
    const doc = setHighlight(two, 0, ["home-2"], AMBER);
    expect(isHighlighted(doc.scenes[1], "home-2")).toBe(false);
  });

  it("is the same object when nothing would change", () => {
    const doc = setHighlight(createBoardDoc(), 0, ["home-2"], AMBER);
    expect(setHighlight(doc, 0, ["home-2"], AMBER)).toBe(doc);
    expect(setHighlight(doc, 0, ["home-5"], null)).toBe(doc);
    expect(setHighlight(doc, 0, [], AMBER)).toBe(doc);
  });

  it("ignores a scene the board does not have", () => {
    const doc = createBoardDoc();
    expect(setHighlight(doc, 9, ["home-2"], AMBER)).toBe(doc);
  });

  it("takes the ball, as hiddenRuns does", () => {
    const doc = setHighlight(createBoardDoc(), 0, [BALL_ID], AMBER);
    expect(isHighlighted(doc.scenes[0], BALL_ID)).toBe(true);
  });

  it("still validates", () => {
    const doc = setHighlight(createBoardDoc(), 0, ["home-2"], AMBER);
    expect(boardDocSchema.safeParse(doc).success).toBe(true);
  });
});
