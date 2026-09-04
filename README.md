# mapping-demo

An interactive trek route viewer — the kind of thing a trek page would embed
instead of a static image and a paragraph of text. Built as a commercial demo.

**Live:** https://www.trekmaps.in/
**Build writeup:** [Raw write-up of a demo I built while extending RidgeView](https://medium.com/@akshmittal/raw-write-up-of-a-demo-i-built-while-extending-ridgeview-6d7679a2cbfe)

An extension of [RidgeView](https://github.com/AkshMittal/RidgeView). I pulled
out only what I needed — the map, the chart, some sync logic — and left the
rest, so I could stop fighting UI and work on the actual problem.

**demo image:** ![mapping-demo](images/demo.png)

---

## The problem it actually solves

RidgeView visualized a raw GPX file. That was never the truth. GPX files are
noisy, and zoomed in they straight up lie — and computing distance, elevation
gain and slope off raw points distorts all three.

So the first real work was cleaning the data.

I smooth with a moving average. It's probably not standard GIS practice, but it
lies less than raw GPX does. The goal was never scientifically correct
coordinates — it was **data that is true at a distance**. Different recorders log
at different intervals, distances and accuracies, so the smoothing window is
chosen from the point count of the file, which balances performance against
visual honesty.

---

## What it does

- **Timeplay** — the route plays through, updating information as the marker
  moves, so a trek reads as something that happens over time rather than a line
- **Camp snapping** — playback pauses at camps, so a day reads as a unit
- **Hover sync** — chart and map drive each other; hovering hands control back
  to the user
- **Day segmentation** — the active day highlights on both map and chart
- **Recentering** — if the marker leaves the viewport, the map follows it back
- **Map layers** — topographic and satellite, genuinely useful on technical
  routes
- **Metrics** — distance, elevation gain, start and end
- **Two routes** — Hampta Pass and Kedarkantha, with camp data

---

## The dual-index system, and why it shouldn't exist

This is the honest part.

I committed early to a single source of truth: one index driving the chart, the
map, the info panels and playback. Correct model. But playback was ugly — the
marker skipped frames and hopped across the route.

I learned about frame limiting and aligned playback to `requestAnimationFrame`.
Better, still bad. I concluded that one index serving every dynamic element was
too heavy for the playback loop, and split it: a main index for chart and map, a
separate `playbackIndex` for timeplay, plus **fractional indexing** so the marker
moves smoothly across skipped frames. That bought smoothness and cost a pile of
sync rules — when the two indices agree, when they don't, and how hover,
playback and chart interaction each touch both.

Then I got a syntax error in the chart module. The chart didn't load. Playback
was suddenly butter smooth.

The chart was the performance killer. I had been calling `chart.update()` on
every iteration of the playback loop, rebuilding the entire chart every frame,
when `chart.draw()` or `chart.update('none')` was what I wanted. **The whole
dual-index system exists because of that one mistake.**

By the time I understood this I was deep in makeshifts built on top of it — camp
snapping, fractional indices skipping semantic points, sync rules everywhere —
so I kept it. It's wrong, and it's still here. Makeshifts on makeshifts compound
fast, and this is what that looks like.

---

## Other things worth knowing

**Precompute anything that can be precomputed.** RidgeView computed slope
dynamically for hover tooltips, which tanked on fast hovers. Slope and related
metrics now go into arrays at load time and the chart reads static data.

**CSS beat async wiring.** Panning the map could trigger chart hovers and route
snapping. Handling it through map event listeners failed because the map is
created before the chart. Rather than pollute the mental model with async
initialization, a class toggled during panning kills pointer events on the
chart. Crude, effective, much cleaner than the alternative.

**Recentering by visibility, not bounds.** An invisible bounding box felt wrong.
Instead it tracks whether the hover marker is actually in view and only
recenters when it isn't — so a small pan doesn't yank the map back.

**Camp snapping is proximity-based.** Fractional indexing interpolates between
points and frame skipping jumps semantic points, so camps were sometimes hit and
sometimes missed. If the playback index comes close enough to a stored camp
index, it snaps and pauses. The same logic is reused for hover snapping on map
and chart — currently two implementations that should be one.

**Bi-directional sync got deleted.** I imported it from RidgeView because I was
proud of it. Once timeplay and the camp/day panels existed, it was obvious that
a single source of truth with unidirectional flow was the right model. It felt
bad to delete something that looked clever.

---

## Structure

```
src/js/
├── gpx-engine.js         parsing, smoothing, playback, camps, recentering
├── controller-module.js  wiring and UI state
├── map-module.js         Leaflet setup
├── chart-module.js       elevation chart
└── itinerary-module.js   day list
public/routes/            GPX + camps.json per route
```

**Tech:** vanilla JavaScript (ES modules), Leaflet, Chart.js, Vite. No framework.

---

## Status and known wrongness

A demo. It behaves correctly; the foundation under it is weak.

- The dual-index system shouldn't exist (above)
- Camp snapping is implemented twice
- Smoothing alone isn't enough. The correct sequence is **outlier removal →
  smoothing → downsampling** — downsampling bad data just gives smaller bad
  data. Normalization has to come first. That's the rebuild.
- Snapping tolerance is a fixed threshold; it should scale with zoom level
- Routes are hardcoded under `public/routes/`, `camps.json` hand-written
- Mobile works but wasn't the priority
- Timeplay is animation over point index, not real elapsed time

At some point I decided correct behaviour mattered more than perfect structure,
since this gets rebuilt on a stronger data foundation anyway.

Commercial scoping notes are in `commercial DEMO inclusions and trad.txt`, kept
as written.

---

## Provenance

Written by hand — modularization, every function, the smoothing and playback
logic. I asked AI questions and read docs while building, because I was learning
as I built. Nothing here is pasted.
