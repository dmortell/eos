# ADR 0002: Labels are plain text, stored once; Renumber now, Relabel later

**Status:** Accepted (Dave, 2026-10-02): "switch to text labels with relabel (low priority, maybe later) and renumber
(high priority) tool". This replaces the earlier draft, where labels were rendered live from structured parts and a
template.

## Context

Labels live in four places today:
- Frames generated labels and `bakedLabels`
- Outlets `label` / `portLabels`
- Pages `attrs.LABEL` and the `device.alloc[].label` snapshot
- Patching's cached `PortRef.label`

The real problem is the **copies**, not the fact that labels are text. Formats vary per client, and printed labels
must not change by surprise.

## Decision

1. **A label is the text that is printed.** It is stored once, and nothing re-renders it:
   - `Outlet.label`: the outlet's own label (`33-001`, `A.023`).
   - `OutletPort.label`: each port's label (`33-001.A`, `L01.A.023-B07`).
   - Any shape can carry a `label`, so auto-numbering works on everything.
   - `Device.portLabels`: only for ports **not** linked to an outlet (ties, uplinks, switch ports).
2. **A panel port shows the label of the outlet port its link reaches.** There is no copy on the panel, so renaming an
   outlet port updates the panel, the patch list and the plan together. Unlinked ports show their `portLabels` text
   or `—`, and cords to an unlabelled port are refused (the port-level gate from `ux-plan.md`).
3. **New labels:**
   - A new outlet takes **next number** from the last one placed (`nextLabel`: `33-009` → `33-010`, keeping prefix
     and padding).
   - Its ports take the outlet label plus the project's suffix style (`portLabelsFor`: `.A .B` or `.1 .2`).
   - A project may set `labelPatterns` (the `$lib/elevation/labelTemplate` syntax) to generate new labels instead.
4. **Renumber is a high-priority tool (Phase 2).** It rewrites one number group across a set of labels, keeping
   prefix, suffix and zero-padding. It works on outlets and on any labelled shape.

   | Option | Choices |
   |---|---|
   | Order | **pick order** (click them, like Pages' walk renumber), **reading order** (rows down the plan, left to right), or **current label order** (natural sort) |
   | Start / step | e.g. 1 / 1, or 10 / 10 |
   | Which number | the last number group by default, or any other (`L01.A.023`: the floor `01` or the location `023`) |
   | Padding | keep each label's own width, or force one |

   **Outlets carry the change into their ports** (`renumberOutlets`). In each port label, the group holding the
   outlet's old number changes the same way, so:
   - `33-001.A` becomes `33-005.A`
   - in `L01.A.023-B07`, only the `023` changes; the floor `01` and the port `07` stay

   Port labels that don't contain the number (e.g. `SPARE`) are left alone.

   The tool previews before / after, and the whole run is one undo step.
5. **Relabel from a pattern is a later, low-priority tool.** It would regenerate a selection's labels from a
   `labelPatterns` template (format changes, a client switching `.` to `-`), with a preview.
6. **Printed labels.** A panel's `labelsPrintedAt` is set when its stickers are printed. From then on, editing or
   renumbering any label linked to that panel asks first, and lists the panels whose stickers would change. The issued
   sheets (revisions) record what was printed. No label snapshot is kept on the panel.
7. **Validation, not enforcement:**
   - A duplicate outlet label **on the same level** is an error. Common formats such as `A.001` carry no floor, so
     the same label on two floors is fine; the LR import showed this.
   - A duplicate port label is a warning.
   - An empty outlet label is an error.

   They appear in the issues grid.

## Legacy import

| Source | Becomes |
|---|---|
| Frames `zoneLocations` + generated / baked labels | Outlets whose label is the location's outlet label (`labelFormat.outletTemplate`, else `Z.NNN`) and whose port labels are the baked label where one exists, else the generated one, i.e. the strings on the stickers |
| Frames `portAssignments` / `structuredLinks` | Links |
| Frames `portReservations` | `PanelInfo.reservations` |
| Frames `labelsPrinted` | `labelsPrintedAt` (import time) |
| Frames `labelFormat` | `labelPatterns` (via `templateForLegacyFormat`) |
| Outlets | `outlets[].locationId` merges the drawn outlet into its location's Outlet. The Outlets doc's own `label` / `portLabels`, where they differ from the Frames strings, are **reported** (the Frames sticker text wins). |
| Pages `attrs.LABEL` / `PORTS` | Outlet labels |
| Pages `device.alloc` | Links, matched by label; anything unmatched is reported, never dropped |

## Consequences

- **What you type is what prints.** No template is needed to read or edit a label.
- **A format change or zone renumber is a deliberate action** (Renumber now, Relabel later), never a side effect.
- **A label can disagree with its data** (e.g. it says server room B, but the port is cabled to A). A later "label
  check" can compare labels against a pattern and list mismatches as warnings, alongside Relabel.
