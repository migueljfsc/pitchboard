import { describe, expect, it } from "vitest";
import { createBoardDoc } from "@/formations";
import { PITCH_PADDING } from "@/board/pitch";
import { totalSeconds } from "@/board/scenes";
import {
  boardAspect,
  exportSize,
  exportView,
  frameCount,
  frameTime,
  gifDelays,
  sampleIndices,
} from "./frame";

const doc = createBoardDoc();

describe("boardAspect", () => {
  it("covers the pitch plus its grass band", () => {
    const expected =
      (doc.pitch.length + PITCH_PADDING * 2) / (doc.pitch.width + PITCH_PADDING * 2);
    expect(boardAspect(doc, { half: "full", rotated: false })).toBeCloseTo(expected, 10);
  });

  it("inverts when the board is rotated", () => {
    const upright = boardAspect(doc, { half: "full", rotated: false });
    const turned = boardAspect(doc, { half: "full", rotated: true });
    expect(turned).toBeCloseTo(1 / upright, 10);
  });

  it("is nearly square on a half view", () => {
    const half = boardAspect(doc, { half: "left", rotated: false });
    expect(half).toBeGreaterThan(0.7);
    expect(half).toBeLessThan(1.4);
  });
});

describe("exportSize", () => {
  it("puts the requested pixels on the long edge", () => {
    expect(exportSize(1920, doc, { half: "full", rotated: false }).width).toBe(1920);
    expect(exportSize(1920, doc, { half: "full", rotated: true }).height).toBe(1920);
  });

  it("keeps the board's aspect", () => {
    const size = exportSize(1920, doc, { half: "full", rotated: false });
    expect(size.width / size.height).toBeCloseTo(boardAspect(doc), 2);
  });

  it("is even on both axes, which H.264 requires", () => {
    for (const half of ["full", "left", "right"] as const) {
      for (const rotated of [false, true]) {
        for (const edge of [960, 1280, 1920, 2560, 3840]) {
          const size = exportSize(edge, doc, { half, rotated });
          expect(size.width % 2).toBe(0);
          expect(size.height % 2).toBe(0);
        }
      }
    }
  });
});

describe("exportView", () => {
  it("suppresses editor chrome", () => {
    const size = exportSize(1920, doc);
    const view = exportView(doc, size);
    expect(view.interactive).toBe(false);
    expect(view.selection).toBeUndefined();
    expect(view.editScene).toBeUndefined();
  });

  it("fits the board with no dead space on either axis", () => {
    // A size derived from boardAspect means fitViewport is constrained equally
    // by both axes: the pitch touches all four margins.
    const size = exportSize(1920, doc);
    const view = exportView(doc, size);
    const across = (doc.pitch.width + PITCH_PADDING * 2) * view.scale;
    const along = (doc.pitch.length + PITCH_PADDING * 2) * view.scale;
    expect(along).toBeCloseTo(size.width, 0);
    expect(across).toBeCloseTo(size.height, 0);
  });

  it("scales linearly with the requested size", () => {
    const small = exportView(doc, exportSize(1280, doc));
    const large = exportView(doc, exportSize(2560, doc));
    expect(large.scale / small.scale).toBeCloseTo(2, 2);
  });
});

describe("frameCount", () => {
  it("covers [0, duration) and never duration itself", () => {
    expect(frameCount(2, 30)).toBe(60);
    expect(frameTime(59, 30)).toBeLessThan(2);
  });

  it("never yields an empty clip", () => {
    expect(frameCount(0, 60)).toBe(1);
    expect(frameCount(0.001, 24)).toBe(1);
  });

  it("gives a real board a sane frame count", () => {
    expect(frameCount(totalSeconds(doc), 30)).toBeGreaterThan(0);
  });
});

describe("gifDelays", () => {
  it("is a whole number of centiseconds per frame", () => {
    for (const delay of gifDelays(50, 30)) expect(delay % 10).toBe(0);
  });

  it("does not accumulate rounding error", () => {
    // 30 fps rounds every frame from 33.3ms to 30ms; naive rounding loses a
    // tenth of the running time. Total here stays within one frame of exact.
    const frames = 300;
    const total = gifDelays(frames, 30).reduce((a, b) => a + b, 0);
    expect(Math.abs(total - (frames / 30) * 1000)).toBeLessThanOrEqual(1000 / 30);
  });

  it("is exact at rates that divide 100", () => {
    expect(gifDelays(10, 25).every((d) => d === 40)).toBe(true);
    expect(gifDelays(10, 20).every((d) => d === 50)).toBe(true);
  });
});

describe("sampleIndices", () => {
  it("includes the first and last frame", () => {
    const picked = sampleIndices(100, 16);
    expect(picked[0]).toBe(0);
    expect(picked.at(-1)).toBe(99);
  });

  it("never asks for a frame that does not exist", () => {
    for (const frames of [1, 2, 3, 7, 16, 17, 1000]) {
      for (const index of sampleIndices(frames, 16)) {
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(frames);
      }
    }
  });

  it("does not repeat a frame on a short clip", () => {
    const picked = sampleIndices(5, 16);
    expect(new Set(picked).size).toBe(picked.length);
  });
});
