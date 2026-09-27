<script lang="ts">
	// HELP (the title bar's ?, F1, or the HELP command) — modelled on Kestrel CAD's help dialog: the keyboard / mouse
	// shortcuts, typing into the command line, "how do I…" answers, and every command (from ui/commands.ts, so it
	// stays current; click one to run it). One search box filters all of it.
	import { tick } from 'svelte'
	import { Icon } from '$lib'
	import { COMMANDS, primaryName, type CmdDef } from '../ui/commands'

	let { onclose, onrun }: { onclose: () => void; onrun?: (id: string) => void } = $props()

	const SHORTCUTS: [string, string][] = [
		['Undo / Redo', 'Ctrl+Z / Ctrl+Y'], ['Find a drawing', 'Ctrl+K'], ['Delete the selection', 'Delete'],
		['Copy / Cut / Paste', 'Ctrl+C / X / V'], ['Duplicate', 'Ctrl+D'], ['Group / Ungroup', 'Ctrl+G / Ctrl+Shift+G'],
		['Draw order: forward / to front', 'Ctrl+] / Ctrl+Shift+]'], ['Draw order: backward / to back', 'Ctrl+[ / Ctrl+Shift+['],
		['Nudge (× 10 with Shift)', 'Arrow keys'], ['Zoom in / out / fit', '+ / − / Home'], ['Pan', 'Right- or middle-drag'],
		['Zoom at the cursor', 'Wheel (ACAD on)'], ['Keep square / 15° / H-V', 'Shift while drawing'],
		['Finish a line / run', 'Enter · double-click · right-click'], ['Cancel · back to Select · deselect', 'Esc (repeat)'],
		['Edit text in place', 'Double-click it'], ['Add a node to a wall / conduit', 'Double-click a segment'],
		['Branch from a node', 'Ctrl-drag the node'], ['Pull a node off a joined run / split a run there', 'Alt-drag the node'],
		['Select a run, then one segment', 'Click it, click again'], ['Enter a viewport on a sheet', 'Double-click it'],
		['Window select (enclosed) / crossing (touched)', 'Drag left → right / right → left'], ['Edit a dimension’s text or a line’s label', 'Double-click it'],
		['Big text editor for a note / text', 'Double-click a note · Shift+double-click a text'], ['Orbit the 3D view (about the view middle)', 'Drag (3D view)'],
		['Repeat the last command', 'Enter / Space on an empty line'], ['Drag out a copy of shapes / 3D objects', 'Ctrl+drag'],
		['Select shapes and 3D objects together', 'Drag a box · Shift / Ctrl+click (they move, copy, nudge and delete together)'],
		['Sheet viewport: step its scale / pan its contents', 'Alt+wheel / Alt+drag over it'],
		['Sheet viewports: select several / nudge them', 'Shift+click borders or drag a box · arrows (Shift = 10 mm)'],
		['Sheet viewports: MOVE / COPY / ARRAY / ALIGN / ERASE (paper mm, e.g. M, 0,0, @20,0)', 'Type the command with no viewport active'],
		['Draw a new sheet viewport', 'Viewport tool: two clicks (ACAD) or press-drag · Alt = no snap'],
		['Select several layers / tree items (places, sheets) / drawings', 'Ctrl+click toggles · Shift+click takes the range'],
		['…then act on them all', 'Layers: eye / lock / drag, or the bar below · tree: drag, ⋮ Delete'],
		['Paste at the cursor (Ctrl+V keeps the position)', 'Ctrl+Shift+V'], ['Zoom to the selection', 'Z, Enter (with a selection)'],
		['Type a command', 'Just type (over the drawing)'],
	]
	type HowTo = { q: string; a: string }
	const HOWTO: HowTo[] = [
		{ q: 'Hidden lines, black & white, or a plan cut for one floor', a: 'Select the viewport on the sheet (click its border). Properties › VIEWPORT: Hidden lines Show / Hide and Colour → black and white. PLAN CUT sets the height band (Z↓ / Z↑); “Fit to floor” picks one floor, slab to slab.' },
		{ q: 'Connection points on a box (where trunks / pipes attach)', a: 'Select the box. Properties › CONNECTION POINTS: “Place…”, then click on the plan where each point goes (it snaps to corners / edges); Esc or Done ends. U / V are fractions of the width / depth (0.5 = the middle), so points stay put when the box is resized. “Default” = the centre + the four edge midpoints. The × marks show while the box or a conduit is selected.' },
		{ q: 'A floor-tile grid', a: 'Draw a rectangle over the area, then Properties › RECT › Tile grid: the tile size in mm (dX / dY shift the grid to line up with the building).' },
		{ q: 'Renumber outlets by clicking them in order', a: 'Select the outlet to start from → Properties › “Renumber by clicking from here…”, then click the others in order; each takes the next label. Esc stops.' },
		{ q: 'Auto-number several shapes at once', a: 'Select them → Properties › AUTO-NUMBER: a template (# = the number), start, step, the attribute (LABEL for outlets) and the order (rows / columns), then “Number”.' },
		{ q: 'Edit several outlets together', a: 'Select them (Shift-click, or drag a window). Properties › BLOCKS · n edits the block, ports, note, type, scale and mirror of all of them; “— mixed —” = they differ.' },
		{ q: 'Solid vs outline outlets', a: 'An outlet’s Fill: filled = low level, None = an outline (high level). Properties › STYLE › Fill.' },
		{ q: 'Resize a block (a door swing, a symbol)', a: 'Select it and drag the scale handle at its far corner (Shift = steps of 0.25), or type Properties › BLOCK › Scale.' },
		{ q: 'Join conduits / attach a trunk to a box', a: 'Draw the new run starting or ending on the other run’s node (or on a box’s × connection point) — it joins / attaches, and follows when that moves. Alt-drag a node to pull it off again.' },
		{ q: 'Split a wall / trunk at a node (disconnect it)', a: 'Alt-drag the node: it comes apart. To choose which side comes away, select that segment first (click the run, click again on the segment), then Alt-drag its end node; otherwise the segment pointing the way you drag comes away. Alt-drag also pulls a node off another run it is joined to.' },
		{ q: 'Line up or space shapes evenly', a: 'Select 2+ shapes → Properties › ARRANGE › Align (left / centre / right / top / middle / bottom — to the extreme one) or Distribute (equal gaps, 3+). Or the ALIGN command.' },
		{ q: 'Copies in a grid or round a centre', a: 'Select the shape(s) and type AR: Rectangular (columns, rows, spacing) or Polar (centre, count, angle).' },
		{ q: 'Draw with exact sizes', a: 'Type into the command line: L, then 0,0 (absolute) · @1200,0 (relative) · @900<90 (distance < angle) · or just 1200 = that far toward the cursor. Enter finishes, C closes, U undoes a point.' },
		{ q: 'Freeze or lock a layer in one viewport only', a: 'Activate the viewport (double-click it): the Layers panel’s eye then hides the layer in THAT viewport only (a snowflake shows it is frozen there; Shift+click the eye to hide it everywhere); the lock column beside it locks it in that viewport only.' },
		{ q: 'Delete a sheet (and get it back)', a: 'Tree › the sheet’s menu › Delete (click again to confirm), or the Drawings dialog. The message offers Undo.' },
		{ q: 'Copy shapes to another tab / project, or paste a screenshot', a: 'Ctrl+C copies the selection to the system clipboard too, so Ctrl+V pastes it in another browser tab or project. Ctrl+V with an image on the clipboard (a screenshot, a copied picture) inserts it as an image shape — set its scale / crop in Properties.' },
		{ q: 'Export', a: 'File › Export… (DXF), File › Outlet Schedule… (Excel), SVGOUT / PNGOUT (the view as on screen), PDF / Print (choose “Save as PDF”).' },
		{ q: 'A section elevation that follows its box', a: 'Select the Section box in plan → the toolbar’s viewport button drops that direction onto the open sheet: sized to the cut, fitted, and LINKED — move / resize the box and the elevation updates. The ground line spans the cut.' },
		{ q: 'Section views / elevations from the plan', a: 'Draw a Section (SEC) box on the plan, select it and click one of its arrows — that elevation drops onto the current sheet as a viewport.' },
		{ q: 'Copy walls / furniture / racks to another model or project (also from the Sheets tool)', a: 'Select them and Ctrl+C (in a Sheets 3D viewport too), then Ctrl+V in the other view — they land at the same coordinates (pasted back into the same model they step 5 paper mm aside). Layers are matched by name.' },
		{ q: 'Draw trunks / pipes of a given size and height', a: 'Pick Trunk or Pipe: the bar at the top of the pane sets the catalogue item (conduit, trunking, tray, ladder …), Rect / Round, W × H, and where it runs (under floor, plenum, below ceiling, wall, custom Z) — the height comes from the floor’s levels.' },
		{ q: 'Doors and windows as holes', a: 'Pick Door, Window or Hole (the Openings group on the tool strip, Insert menu, or DOOR / WINDOW): the bar at the top shows the type, its height and sill. Drag the box across the wall (plan). In 3D the wall is built around it (jambs, header, sill) so you see through it; plan / elevations show the masked gap. Properties › the opening sets door swing / window.' },
		{ q: 'Where is each tool?', a: 'The tool strip runs in sections: Select · Line, Shapes (rectangle / ellipse / arc), Text · Wall, Openings (door / window / hole / penetration), Boxes (box / rack) · Conduits (trunk / pipe) · Dimension / Measure / H + V guides, Section · Format painter, Viewport. A button with a corner mark is a group — hover it for the others; it remembers the last one used. Box = a 3D box (furniture, cabinets …).' },
		{ q: 'A desk with legs (a hole through furniture)', a: 'Draw the desk as a Box, then an Opening (Rect hole) through it — right across its full depth or width, as high as the leg space. The box is split into its legs and top in 3D and elevations; the hole shows as a dashed outline in plan. Save it to the library as a block later.' },
		{ q: 'Pick a shape under a box (e.g. under a table top)', a: 'Turn WIRE on in the status bar: boxes then pick only on their outline, so what is under / inside them can be clicked.' },
		{ q: 'Make a shape’s layer the current one', a: 'Select the shape → the ✓ beside Properties › Layer; or the crosshair in the Layers panel search box (LAYMCUR), then click the shape.' },
		{ q: 'Change a sheet viewport’s direction (front / plan / 3D)', a: 'The ViewCube / 3D popout only PREVIEWS the change on a sheet viewport: click Keep in the chip under the ViewCube to make it stick; Revert, or leaving the viewport, puts the old direction back — so a front view isn’t accidentally printed as 3D.' },
		{ q: 'Share a link to a drawing', a: 'The address bar carries the selected tree item (?node=… / ?doc=…) — copy it; it opens the same place / drawing for someone else.' },
		{ q: 'Measure a distance', a: 'The Measure button (ruler + pencil) or DIST: click two points — the distance and angle show in the command line, nothing is drawn.' },
		{ q: 'Core drills / penetrations', a: 'The Penetration button (Openings group) or PEN: the diameter and wall / slab once, then click each spot — tags count on (P01, P02 …). Edit the tag / Ø in Properties.' },
		{ q: 'A cable ladder or hatched area', a: 'Draw a rectangle (or ellipse / closed polyline), then Properties › HATCH: Vertical lines at 300 mm spacing reads as ladder rungs; Horizontal, Grid and Diagonal too.' },
		{ q: 'Stacked (baseline) dimensions with extension lines', a: 'Draw one dimension, then DIMBASELINE (DBA): each next click stacks a dimension from the same base with extension lines back to the points. Any dimension: Properties › Ext. lines.' },
		{ q: 'Wrapped notes / a notes table', a: 'NOTE, or Properties › TEXT › Wrap on: markdown (# heading, - list, | table |, **bold**) wrapped to a width. The pencil (or double-click it) opens the big editor with a preview; paste from Word / Excel keeps the formatting.' },
		{ q: 'Perspective / iso / wireframe 3D', a: 'The 3D button under the ViewCube opens a popout: 3D = perspective (the default), ISO = parallel iso, WIRE = see-through wireframe (PERSPECTIVE on / off on the command line too). Drag to orbit — it turns about the middle of the view.' },
		{ q: 'Line up with other points while drawing', a: 'OTRACK (status bar, on by default): move level with an end / midpoint and a dashed blue guide locks you to its x or y. POLAR (F10) gives 15° rays; ORTHO (F8) horizontal / vertical.' },
		{ q: 'Check walls / conduits for broken bits', a: 'AUDIT: lists missing blocks, then broken wall / conduit nodes and segments, loose connections and stale rack allocations, and offers to fix them (one undo step).' },
	]
	const EXAMPLES = ['LINE 0,0 @3000,0 @0,2000 ENTER', 'REC;0,0;1200,600', 'C 500,500 250', 'M · pick a base point · @500,0', 'AR · R · 4 · 1 · 1500', 'ZW · two corners']

	let q = $state('')
	const hit = (...s: string[]) => { const t = q.trim().toLowerCase(); return !t || s.some((x) => x.toLowerCase().includes(t)) }
	const shortcuts = $derived(SHORTCUTS.filter(([a, b]) => hit(a, b)))
	/** Function keys — the app's own, and the browser's (which the app leaves alone). */
	const FKEYS: [string, string][] = [
		['F1', 'This help'], ['F8', 'ORTHO on / off (lines, walls, trunks, pipes: horizontal / vertical)'], ['F9', 'SNAP to the grid on / off'],
		['F10', 'POLAR tracking on / off (15° rays)'], ['F11', 'Full screen (the browser)'], ['F12', 'Developer tools (the browser)'],
		['F3 · F5 · F6 · F7', 'Browser keys (find · reload · address bar · caret browsing) — not used by Pages'],
	]
	const fkeys = $derived(FKEYS.filter(([a, b]) => hit(a, b) || hit('function keys F-keys')))
	const howto = $derived(HOWTO.filter((h) => hit(h.q, h.a)))
	const groups = $derived.by(() => {
		const cs = COMMANDS.filter((c) => hit(c.label, c.names, c.description, c.group))
		return [...new Set(cs.map((c) => c.group))].map((g) => [g, cs.filter((c) => c.group === g)] as [string, CmdDef[]])
	})
	let open = $state<string | null>(null)
	function onKey(e: KeyboardEvent) { if (e.key === 'Escape') { e.preventDefault(); onclose() } }
	function focusSearch(node: HTMLElement) { tick().then(() => node.querySelector('input')?.focus()) }
</script>

<svelte:window onkeydown={onKey} />
<div class="hp-back">
	<button class="hp-dismiss" aria-label="Close" tabindex="-1" onclick={onclose}></button>
	<div class="hp" role="dialog" aria-modal="true" aria-label="Help" tabindex="-1" use:focusSearch>
		<div class="hp-head"><Icon name="help" size={15} /><span>Pages — help</span>
			<input class="hp-q" bind:value={q} placeholder="Search help, shortcuts and commands…" spellcheck="false" />
			<button class="hp-x" title="Close (Esc)" onclick={onclose}><Icon name="x" size={15} /></button></div>
		<div class="hp-body">
			{#if howto.length}
				<h3>How do I…</h3>
				{#each howto as h (h.q)}
					<div class="how" class:open={open === h.q || !!q.trim()}>
						<button class="how-q" onclick={() => (open = open === h.q ? null : h.q)}>{h.q}</button>
						{#if open === h.q || q.trim()}<p>{h.a}</p>{/if}
					</div>
				{/each}
			{/if}
			{#if shortcuts.length}
				<h3>Keys &amp; mouse</h3>
				<div class="grid">{#each shortcuts as [a, b] (a)}<div class="row"><span>{a}</span><kbd>{b}</kbd></div>{/each}</div>
			{/if}
			{#if fkeys.length}
				<h3>Function keys</h3>
				<div class="grid">{#each fkeys as [k, what] (k)}<div class="row"><span>{what}</span><kbd>{k}</kbd></div>{/each}</div>
			{/if}
			{#if !q.trim() || hit('command line coordinates point typed')}
				<h3>The command line</h3>
				<p>Type anywhere over the drawing — it lands in the command line above the status bar (Tab completes, ↑ / ↓ recall). A command asks for what it needs (“Specify base point:”): type <code>X,Y</code>, <code>@DX,DY</code> (from the last point), <code>@D&lt;ANGLE</code>, or a bare distance (toward the cursor) — or click in the view (it snaps). Enter / Space / right-click = done or repeat the last command; Esc cancels. Separate steps with spaces, or with <code>;</code> when Space means Enter (ACAD mode); <code>;;</code> is an Enter.</p>
				<div class="note">{#each EXAMPLES as ex (ex)}<code>{ex}</code><br />{/each}</div>
			{/if}
			{#each groups as [g, cs] (g)}
				<h3>{g} commands</h3>
				<div class="cmds">
					{#each cs as c (c.id)}
						<button class="cmd" title="Run it" onclick={() => { onrun?.(c.id); onclose() }}><b>{primaryName(c)}</b><span class="al">{c.names.split('·').slice(1).join(' ·')}</span><span class="d">{c.description}</span></button>
					{/each}
				</div>
			{/each}
			{#if !howto.length && !shortcuts.length && !groups.length}<p class="none">Nothing matches “{q}”.</p>{/if}
		</div>
	</div>
</div>

<style>
	.hp-back { position:fixed; inset:0; z-index:200; background:#0007; display:flex; align-items:flex-start; justify-content:center; padding-top:6vh; }
	.hp-dismiss { position:absolute; inset:0; background:none; border:none; cursor:default; }
	.hp { position:relative; width:min(760px,94vw); max-height:84vh; display:flex; flex-direction:column; background:var(--panel); border:1px solid var(--line); border-radius:10px; box-shadow:0 24px 70px #0009; overflow:hidden; color:var(--text); }
	.hp-head { display:flex; align-items:center; gap:8px; padding:10px 14px; border-bottom:1px solid var(--line-soft); font-size:12px; font-weight:700; }
	.hp-q { flex:1; margin-left:10px; background:var(--input); color:var(--text); border:1px solid var(--line); border-radius:5px; padding:4px 8px; font-size:12px; font-weight:400; }
	.hp-q:focus { outline:none; border-color:var(--accent); }
	.hp-x { background:none; border:none; color:var(--muted); cursor:pointer; display:grid; place-items:center; }
	.hp-body { overflow:auto; padding:4px 16px 14px; font-size:12px; line-height:1.5; }
	h3 { margin:14px 0 6px; font-size:10px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--faint); }
	p { margin:4px 0; color:var(--muted); }
	code { font-family:Consolas,monospace; color:var(--accent); font-size:11px; }
	.note { margin:6px 0; padding:8px 10px; border-left:2px solid var(--accent-dim); background:var(--input); border-radius:4px; }
	.grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:2px 18px; }
	.row { display:flex; justify-content:space-between; gap:10px; padding:2px 0; border-bottom:1px solid var(--line-soft); }
	.row span { color:var(--muted); }
	kbd { font-family:Consolas,monospace; font-size:11px; color:var(--text); white-space:nowrap; }
	.how { border-bottom:1px solid var(--line-soft); }
	.how-q { width:100%; text-align:left; background:none; border:none; color:var(--text); padding:5px 0; cursor:pointer; font-size:12px; }
	.how-q::before { content:'▸'; display:inline-block; width:14px; color:var(--faint); }
	.how.open .how-q::before { content:'▾'; }
	.how p { margin:0 0 6px 14px; }
	.cmds { display:flex; flex-direction:column; }
	.cmd { display:flex; gap:10px; align-items:baseline; text-align:left; background:none; border:none; color:var(--text); padding:2px 4px; border-radius:4px; cursor:pointer; font-size:12px; }
	.cmd:hover { background:var(--hover); }
	.cmd b { min-width:96px; color:var(--accent); font-family:Consolas,monospace; font-weight:600; }
	.cmd .al { min-width:120px; color:var(--faint); font-family:Consolas,monospace; font-size:11px; }
	.cmd .d { color:var(--muted); }
	.none { color:var(--faint); }
</style>
