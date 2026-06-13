# Mac and Touch Support Plan

## Why this change is needed

The app currently assumes desktop mouse input in multiple canvas surfaces. On macOS this becomes problematic because trackpads and gesture devices produce different wheel and drag semantics than the Windows mouse/trackball paths the app was tuned for. The current code also uses raw `movementX` / `movementY` and fixed pixel step sizes in several places, which makes panning feel overly fast or uneven on high-DPI trackpads.

Mobile and iPad support is partially present in some surfaces, but it is not consistent enough to treat as a platform-wide capability.

## What the scan found

The same pan/zoom pattern is repeated in several places:

- [src/routes/projects/[pid]/racks/parts/Canvas.svelte](src/routes/projects/[pid]/racks/parts/Canvas.svelte)
- [src/routes/projects/[pid]/risers/parts/Canvas.svelte](src/routes/projects/[pid]/risers/parts/Canvas.svelte)
- [src/routes/projects/[pid]/sheets/parts/Canvas.svelte](src/routes/projects/[pid]/sheets/parts/Canvas.svelte)
- [src/routes/projects/[pid]/uploads/parts/PdfViewer.svelte](src/routes/projects/[pid]/uploads/parts/PdfViewer.svelte)
- [src/routes/projects/[pid]/outlets/parts/OutletCanvas.svelte](src/routes/projects/[pid]/outlets/parts/OutletCanvas.svelte)
- [src/routes/projects/[pid]/patching/parts/ElevationView.svelte](src/routes/projects/[pid]/patching/parts/ElevationView.svelte)
- [src/routes/projects/[pid]/drawings/parts/PageCanvas.svelte](src/routes/projects/[pid]/drawings/parts/PageCanvas.svelte)

The main recurring patterns are:

- Right-button or middle-button drag starts panning.
- Wheel input is treated as a single fixed pan step, or as zoom when modifier keys are held.
- Trackpad pinch often appears as `wheel` with `ctrlKey` on macOS, but the current handling does not normalize scale or speed.
- Touch support exists in some canvases, but it is inconsistent and usually only covers pinch gestures.

## Local diagnosis

The core problem is not just "Mac support". It is that input is interpreted directly at the component level without a shared normalization layer. That means each canvas has its own assumptions about:

- how much wheel delta should equal one pan increment,
- whether wheel should pan horizontally, vertically, or zoom,
- how pointer deltas should be scaled under ancestor transforms,
- whether touch is supported at all,
- how to prevent page-level scrolling or browser zoom.

This makes the app hard to tune for macOS and nearly impossible to make consistent across mouse, trackpad, and touch.

## Proposed approach

### 1. Create one shared input controller

Add a reusable controller or Svelte action in `src/lib/ui/` or `src/lib/utils/` that owns the platform-neutral parts of canvas navigation.

Recommended shape:

- A small class or factory that tracks `x`, `y`, `zoom`, and `panning`.
- Methods for `wheel`, `pointer down/move/up`, and `touch pinch`.
- A single configuration object for gesture policy:
  - allowed pan buttons,
  - zoom bounds,
  - wheel sensitivity,
  - whether shift-wheel pans horizontally,
  - whether trackpad pinch should map to zoom,
  - whether touch pan/pinch is enabled.
- A helper for screen-to-canvas coordinate conversion so nested canvases can compensate for ancestor scaling.

If we want the easiest adoption path in Svelte, a Svelte action is a good fit for attaching non-passive wheel and touch listeners. If we want the best reuse across existing logic, a small class plus a thin action wrapper is the stronger option.

### 2. Normalize wheel input on macOS

Use a shared wheel policy that treats these cases separately:

- `ctrlKey` / `metaKey` / `altKey` zoom gestures.
- Shift-wheel horizontal panning.
- Plain wheel vertical panning.
- Trackpad events that emit small deltas should be smoothed or scaled differently from mouse wheels.

The key goal is to stop using a single hard-coded pixel jump for every wheel tick. Instead, translate wheel delta into a controlled step with device-aware sensitivity.

### 3. Replace `movementX` / `movementY` with explicit pointer tracking where needed

Raw `movementX`/`movementY` can feel different across browsers and pointer devices. For drag panning, track the previous client position and compute deltas yourself. That gives us:

- stable behavior across browsers,
- easier touch parity,
- predictable sensitivity on Retina trackpads,
- the ability to apply zoom-aware or ancestor-scale-aware normalization consistently.

### 4. Add touch support in the shared layer

Base touch support should include:

- one-finger pan,
- two-finger pinch zoom,
- optional two-finger pan without zoom jitter,
- prevention of browser page scroll while interacting with the canvas.

This should be opt-in per surface because some tools still need clicks/taps to mean selection or editing rather than navigation.

### 5. Make the surfaces consume the shared helper incrementally

Start with the most visible / reused canvases:

1. [src/routes/projects/[pid]/racks/parts/Canvas.svelte](src/routes/projects/[pid]/racks/parts/Canvas.svelte)
2. [src/routes/projects/[pid]/risers/parts/Canvas.svelte](src/routes/projects/[pid]/risers/parts/Canvas.svelte)
3. [src/routes/projects/[pid]/uploads/parts/PdfViewer.svelte](src/routes/projects/[pid]/uploads/parts/PdfViewer.svelte)
4. [src/routes/projects/[pid]/sheets/parts/Canvas.svelte](src/routes/projects/[pid]/sheets/parts/Canvas.svelte)

Then fold in the more specialized views:

1. [src/routes/projects/[pid]/outlets/parts/OutletCanvas.svelte](src/routes/projects/[pid]/outlets/parts/OutletCanvas.svelte)
2. [src/routes/projects/[pid]/patching/parts/ElevationView.svelte](src/routes/projects/[pid]/patching/parts/ElevationView.svelte)
3. [src/routes/projects/[pid]/drawings/parts/PageCanvas.svelte](src/routes/projects/[pid]/drawings/parts/PageCanvas.svelte)

This sequencing minimizes risk because the first four are closest to the shared canvas model and will expose most of the platform issues quickly.

## Recommended implementation shape

Preferred option: a reusable controller with an action wrapper.

Example responsibilities:

- controller computes pan/zoom state changes,
- action attaches `wheel`, `pointer`, `touchstart`, `touchmove`, and `touchend` listeners with `passive: false` where needed,
- component provides callbacks for "apply pan", "apply zoom", and "commit interaction".

That separation keeps the math reusable and keeps the Svelte components small.

## Validation plan

After the helper exists and at least one canvas consumes it, verify:

- Mac trackpad two-finger scroll pans smoothly and does not jump too far.
- Mac pinch zoom feels linear and does not trigger browser zoom.
- Mouse wheel still works on Windows/Linux.
- Right-button and middle-button drag still pan on desktop.
- iPad / mobile pinch and one-finger pan work on at least the top-level canvas surfaces.
- Nested canvases do not leak gestures to their parent container.

## Rollout notes

- Keep current behavior behind the same public props until the helper is proven on one or two surfaces.
- Tune sensitivity in the shared helper rather than per component.
- If any surface needs special behavior, express it through config instead of copying gesture code.

## Suggested next step

Implement the shared controller/action first, then migrate `racks`, `risers`, and `uploads` as the initial proof point.