# Pitchboard brand

A coach's chalk on dark grass, and a link that bends. Reasoning: [D128](../decisions.md#d128--the-brand-a-coachs-chalk-and-a-link-that-bends).

## The mark

An X, a dashed run, an O: a player, his run, the space he runs into.

| Cut | Where | Drawn by |
|---|---|---|
| Clean, dashed run | header, beside the wordmark (24–28 px) | `LogoMark` |
| Chalk grain | splash on error, from ~40 px | `LogoMark chalk` |
| Tile, solid run | browser tab, privacy page | `public/favicon.svg` |
| Full bleed, mark in the central 70% | home screen, manifest | `icon.html` → `icon-*.png`, `apple-touch-icon.png` |

Clear space: half the mark's width on every side. Never recolour it, add a kit colour to it, or put
it on a light ground without its tile.

## The wordmark

"Pitchboard", one word, capital P. Archivo, width 125%, weight 800, tracking −1%, white, over a
hand-drawn amber stroke (`ChalkStroke`). The mark sits left of it, never above.

## The signature

Three home players, 6, 8 and 10, joined by a chalk chain that bends as they run (`LiveLinkMark`).
It means *the shape moves with the players*. Animated on the landing headline and the loading
splash; still, its first shape, in the link preview and under reduced motion. Never more than one
on a screen.

## Colour

| Role | Value | Use |
|---|---|---|
| Ground | `#0e1f17` (`ink-900`) | every brand surface |
| Chalk | `#eef1ea` (`accent`) | the mark, the link, numerals |
| Amber | `#f59e0b` | the stroke under a word, the players in the signature; never a selection or a button |
| Muted | `#bccdc1`, `#6f8e7b` | tagline, small print |

## Chalk

Grain belongs to the brand's own drawings: the mark from ~40 px, the signature's chain, the headline
underline (`.chalk-underline`) and the landing step numerals. The canvas and every export stay clean.

## Where it appears

Where a person meets the product, never in the tools they work with:

- landing page, loading splash, crash page, link preview, app icons
- header wordmark in the editor, the shared board and `/admin`; the privacy page's header
- empty states, as chalk sketches (`Sketch`): nothing selected, nothing drawn, an empty folder or trash
- export progress, as the signature
- the sign-in dialog and the tour card, as the mark

The editor's controls, panels and sections stay as D126 left them.

## Voice

Coach to coach. Short, plain, present tense: *Move the players. Pitchboard plays it back.* No
exclamation marks and no superlatives.

## Raster files

```
docs/brand/render.sh   # og.html → public/og.png; icon.html → icon-512/192.png, apple-touch-icon.png
```

Needs Google Chrome (override with `CHROME=…`) and macOS `sips`.
