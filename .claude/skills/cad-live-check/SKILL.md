---
name: cad-live-check
description: Check a cad change, or make a data edit, in Dave's open Chrome tab on live project data (Project Journey) — use after a cad UI/rack-view/canvas change, when asked to "check it", "try it on <device/rack>", or to link / patch / label / set properties on real devices, racks or outlets.
---

# Checking cad live (Chrome, real project data)

The cad tool is `src/lib/cad`, route `projects/[pid]/cad`. Dave's live data is **Project Journey**, pid
`4Z9WBy4PbwdG5FRQPQnp`. His tab runs the code being edited (HMR), so whatever is done there is done to the real project.

## Ground rules
- **Never start a dev server.** Dave runs it on `localhost:5173`; if it's down, ask him.
- **Reuse his existing EOS tab** (`tabs_context_mcp` first); don't open a new one, and leave it open afterwards.
- **Data edits go through the UI** (Properties, Port properties, Link to…, Assign, Patch to…) so they're undoable and
  logged. Never write Firestore directly to change data — reads for auditing are fine.
- **Don't edit code mid-check**: HMR empties cad's undo stack. Finish (or Undo) the live action first.
- Dave may be working in the same tab: say what you're doing, keep view changes small, report any you made.
- Batch browser actions (`browser_batch`): click, shift-click, JS check, screenshot in one call.

## Finding things
- **Navigator search** (top-left box, ≈ (80, 95)): type a device/rack/outlet name; **double-click** a result to select it
  and show it in the active view (a rack view jumps to its row, zoomed out). A sheet can match first — pick the row whose
  right-hand text shows rack · U.
- **Zoom** = mouse wheel over the view, around the pointer (the point under the cursor stays put). There's no plain-drag
  pan, so to bring something into view zoom out around a point on the side you want it to move toward, then back in on it.
- Use `zoom` screenshots of a region to read small port cells before clicking; map zoom-image px back to page px.

## Selecting ports
- Click a port cell = that port only; **Shift-click** another = the range; Ctrl-click adds/drops one.
- Confirm the selection before acting: `[...document.querySelectorAll('p.font-semibold')].map(p=>p.textContent).find(t=>t.startsWith('Port'))`
  → e.g. `"Ports 97–104 (front)"`, and check the Properties header names the right device.
- Port label inputs: `input[aria-label="Port N label"]`; set `.value` and dispatch `change` (bubbles) — one undo step each.

## Common actions
- **Device properties** (Ports, Side ports, …): select the device, edit the field in Properties.
- **Outlets → panel** (horizontal links): Outlets table → filter → select rows (click, Shift-click) → *Assign N → port…*
  → click the panel's first port. Pinned, one undo step. Labelled panel ports are skipped — check first.
- **Panel → switch / panel ties**: select the panel ports → *Link to…* → click the first port on the other device → a dialog
  lists the pairs → *Link N*. One undo step.
- **Patch cords**: select ports → *Patch to…* → click the first port → OK the list.

## Auditing (read-only)
```js
const { Firestore } = await import('/src/lib/db.svelte.ts')
const all = await new Firestore().getMany('projects/4Z9WBy4PbwdG5FRQPQnp/cadEntities')
const by = Object.fromEntries(all.map(e => [e.id, e]))
// types: device, rack, outlet, link (kind horizontal | tie | backbone), cord, …
```
Audit before (what's already there: links, cords, labels on the target ports) and after (exact pairs / values). Keep
outputs small (the tool truncates) — map to compact strings like `1>062.A 2>062.B …`. Delete any `window.__helpers`
you defined when done.

## Reporting
Say what changed and where (device, rack, U, ports), that it was verified in the data, how to undo (one step or N), and
anything you noticed but didn't touch (e.g. "lengths show ? — no run serves IDF3307"). Mention view changes you made.
