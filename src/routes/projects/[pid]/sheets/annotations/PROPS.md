# Annotation & symbol properties

One `Annotation` interface (`types.ts`) backs every annotation `kind` and every
`symbol`. Most fields are optional and only meaningful for some kinds — this maps
which kind/symbol actually *uses* each field, to find overlaps worth merging.

## Always used
`id` · `kind` · `x,y` · `rotation` · `color` · `layerId`

## Fields by `kind`
| field | text | callout | dimension | line | arrow | rect | ellipse | cloud | image | symbol |
|---|---|---|---|---|---|---|---|---|---|---|
| `x2,y2` (end / pointer) | – | ✓ pointer tip | ✓ end | ✓ end | ✓ end | – | – | – | – | – |
| `w,h` (box) | ✓ | ✓ | – | – | – | ✓ | ✓ | ✓ | ✓ | ✓ |
| `text` | ✓ body | ✓ body | – (auto `{len}mm`) | – | – | – | – | – | – | (elevation legacy) |
| `fontPt` | ✓ | ✓ | ✓ | – | – | – | – | – | – | – |
| `align` | ✓ | ✓ | – | – | – | – | – | – | – | – |
| `border` | – | ✓ none/underline/box | – | – | – | – | – | – | – | – |
| `start,end` (heads) | – | ✓ (end) | ✓ (dflt arrow) | ✓ | ✓ | – | – | – | – | – |
| `dash` | – | ✓ | – | ✓ | ✓ | ✓ | ✓ | – | – | – |
| `fill` | – | ✓ | – | – | – | ✓ | ✓ | ✓ | – | ✓ |
| `src` | – | – | – | – | – | – | – | – | ✓ | – |
| `link` | – | – | – | – | – | – | – | – | – | ✓ (drawing/photo) |
| `symbol` | – | – | – | – | – | – | – | – | – | ✓ |

## Fields by `symbol` (kind = 'symbol')
| symbol | uses | drawn-text source |
|---|---|---|
| section / detail | `link.ref`, `fill` | centre = `link.ref` |
| elevation | `arms{n,e,s,w}`, `link.ref`, `fill` | centre = `link.ref`; arms = per-arm ref; **legacy `text`** = single south arm |
| photo | `link` (photo), `fill` | — |
| north | `color` | "N" (literal) |
| door | `flip`, `w/h` | — |
| faceplate | `fill` | — |
| outlet | **`outlet{label,ports,level,usage,mount,cable,room}`** | `outlet.label` above, ports in triangle |

## Overlap / merge candidates
1. **`outlet.label` ↔ `text`** (the one you flagged). The outlet's label is just a text
   label — folding it into the shared `text` field would let the existing Font (pt) / text
   controls apply, and drop a bespoke field. (Keep the other `outlet.*` data fields.) Same
   logic for any future symbol that shows a caption — use `text`, not a new `*.label`.
2. **`link.ref` ↔ a symbol caption.** section/detail/elevation show `link.ref` (the target
   drawing no.). That's a *link*, not free text — correct as-is, but note it's the de-facto
   "label" for those symbols, so don't also add a `text`/`label` to them.
3. **`x2,y2` is overloaded**: line END (line/arrow/dimension) vs callout POINTER tip. Distinct
   by kind, so fine — but worth a comment so nobody assumes it's always the line end.
4. **`w,h`** is uniform across all box kinds (text/rect/cloud/symbol/callout/image) — good,
   no split.
5. **`start/end/dash`** now shared by all line kinds incl. dimension — good.
6. **`fill`** shared by rect/ellipse/cloud/callout/symbol — good; `'none'` = unfilled.

### Recommendation
The clean win is **#1**: migrate `outlet.label` → `text` (small migration on load), so labels,
fonts and the text editor are shared. Everything else is already reasonably unified; the
overloads (`x2,y2`, `link.ref`-as-caption) are intentional and just need the comments above.
