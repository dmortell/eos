<script lang="ts">
	// Right-sidebar PROPERTIES panel (Pages mockup). Edits the SELECTED entities of the
	// active document with real two-way binding; with several selected it shows the group's
	// common props (bbox X/Y/W/H) and edits apply to all. Falls back to page/general props
	// when nothing is selected. Geometry is in model units (mock).
	import { Icon, ColorPicker } from '$lib'
	import { blockDef, insertBounds } from '../ui/blocks'
	import { blockList } from '../blocks.svelte'
	import { translate, textBox, STYLE_DEFAULTS, type Ent, type Pt, type TextAlign, type VAlign, type Head, type Dash } from '../ui/geometry'
	import { PT_MM, PAPER_PX_PER_MM } from '../constants'
	import { COLORS } from '../palette'
	import { imgEdit, setImgMode } from '../imageEdit.svelte'
	import type { Obj, Layer as MLayer } from '../3dview/types'
	import { type SheetFrame, type Proj, PROJ_OPTS, SCALES } from '../types'
	import { NODE_FIELDS } from '../mock/data'
	import TitleBlockEditor from './TitleBlockEditor.svelte'
	import HeightsDialog from './HeightsDialog.svelte'
	let heightsOpen = $state(false)
	type HeightKey = 'slabMm' | 'raisedFloorMm' | 'clearHeightMm' | 'plenumMm'
	import type { TitleBlockTemplate } from '../titleBlock'

	let { ents = [], onupdate, onarrange, pageTitle = '', pageKind = '', activeLayer = '', node = null, onpagetitle,
		modelObj = null, modelLayers = [], onmodelupdate, onmodeldelete, onmodelseg,
		frameObj = null, onframeupdate, onframedelete, onframefit, nodeInfo = null, onnodefield, modelList = [], activeFrameId = undefined, scaleN = 1,
		sheetInfo = null, onsheetfield, titleBlock = undefined, ontitleblock, frameStoreys = [], heights = null, onheight, onheightall }:
		{ ents?: Ent[]; onupdate?: (e: Ent) => void; onarrange?: (op: 'front' | 'back' | 'forward' | 'backward') => void;
			pageTitle?: string; pageKind?: string; activeLayer?: string; onpagetitle?: (title: string) => void;
			node?: { id: string; label: string; kind: string; floorNumber?: number; building?: string } | null;
			/** A REAL tree node's properties (projectProps.ts, from Firestore) + the edit callback; null → mock fields. */
			nodeInfo?: import('../projectProps').NodeInfo | null; onnodefield?: (key: string, value: string) => void;
			modelObj?: Obj | null; modelLayers?: MLayer[]; onmodelupdate?: (patch: Record<string, unknown>) => void; onmodeldelete?: () => void; onmodelseg?: (segIdx: number, patch: Record<string, unknown>) => void;
			frameObj?: SheetFrame | null; onframeupdate?: (patch: Partial<SheetFrame>) => void; onframedelete?: () => void;
			/** XP19: fit the frame's scale to its model */ onframefit?: () => void;
			modelList?: { id: string; name: string }[]; activeFrameId?: string;
			/** Scale denominator (the N of 1:N) of the viewport the selection is edited in — sizes the
			 *  annotative text bbox in model mm (B19). */
			scaleN?: number
			/** A STORED Pages sheet's title-block fields (Drawing №, Drawn — `drawnDefault` = the creator's initials). */
			sheetInfo?: { number: string; drawnBy: string; drawnDefault: string } | null; onsheetfield?: (key: 'drawingNumber' | 'drawnBy', value: string) => void
			/** The PROJECT's title-block template (edited on a sheet page; undefined = the default). The editor shows
			 *  only with `ontitleblock` (a project with Pages data). */
			/** The selected frame's model storeys (a building) — its FLOORS checklist in an elevation. */
			frameStoreys?: { id: string; name: string }[]
			/** A selected BUILDING place's storey heights (top first) + the edit callback. */
			heights?: { placeId: string; rows: { id: string; name: string; z: number; slabMm: number; raisedFloorMm: number; clearHeightMm: number; plenumMm: number }[] } | null
			onheight?: (placeId: string, storeyId: string, key: HeightKey, value: number) => void
			onheightall?: (placeId: string, key: HeightKey, value: number) => void
			titleBlock?: TitleBlockTemplate; ontitleblock?: (t: TitleBlockTemplate) => void } = $props()
	// R4 (review.md §R4, Dave's decision 2026-09-23): a prism is CALLED "Box" in the UI — the data/code keep
	// `type: 'prism'` unchanged, this is a display label only.
	const MODEL_TYPE_LABEL: Record<string, string> = { prism: 'Box', wall: 'Wall', conduit: 'Conduit' }
	// A prism on an "opening" layer is a door/window/hole; label it as such.
	const modelTypeLabel = (o: Obj) => (o.type === 'prism' && modelLayers.find((l) => l.id === o.layer)?.opening ? 'Opening' : MODEL_TYPE_LABEL[o.type] ?? 'Object')

	/** A wall / conduit segment's true 3D length (model mm) between its two nodes. */
	function segLen(o: Obj, s: { a: string; b: string }): number {
		if (o.type !== 'conduit' && o.type !== 'wall') return 0
		const a = o.nodes.find((n) => n.id === s.a), b = o.nodes.find((n) => n.id === s.b)
		return a && b ? Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0)) : 0
	}
	const fmtLen = (mm: number) => `${(mm / 1000).toFixed(2)} m`   // cable-length friendly
	const kindLabel: Record<string, string> = {
		project: 'PROJECT', building: 'BUILDING', floor: 'FLOOR', zone: 'ZONE', room: 'ROOM', row: 'ROW',
	}

	// View-agnostic unrotated bbox (unlike ui/hit.ts bbox, no elevation collapse / crop window: the panel
	// shows the PLACEMENT). Text is annotative, so its box is the same one the Viewport draws and hits.
	function bbox(e: Ent): [number, number, number, number] {
		if (e.type === 'polyline') { const pts = e.pts ?? []; const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] }
		if (e.type === 'text') return textBox(e, PT_MM * scaleN)
		if (e.type === 'insert') return insertBounds(e)   // no `b`: the block's extent at the insertion point
		const xs = [e.a![0], e.b![0]], ys = [e.a![1], e.b![1]]
		return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
	}
	// Group bbox across the selection.
	let gb = $derived.by(() => {
		if (!ents.length) return null
		let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
		for (const e of ents) { const [a, b, c, d] = bbox(e); x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c); y1 = Math.max(y1, d) }
		return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
	})
	let single = $derived(ents.length === 1 ? ents[0] : null)
	// B19: the inputs are uncontrolled (`value=` + `onchange`), so a half-typed value would survive a selection
	// change and land on the NEXT selection's first commit. Keying the panel body on WHAT is selected remounts
	// every input when the selection changes (a value edit keeps the same ids → no remount, focus kept).
	const selKey = $derived([...ents.map((e) => e.id), modelObj?.id ?? '', frameObj?.id ?? '', node?.id ?? ''].join('|'))
	let typeLabel = $derived(ents.length === 0 ? '' : new Set(ents.map(e => e.type)).size === 1 ? ents[0].type : `Mixed (${ents.length})`)
	const r1 = (n: number) => Math.round(n * 10) / 10

	// (translate lives in ../ui/geometry)
	// Move the whole selection so the group bbox's corner reaches v. Capture the delta and a
	// snapshot up front — each onupdate re-derives gb/ents, so reading them mid-loop drifts.
	function setX(v: number) { if (!gb) return; const dx = v - gb.x, snap = [...ents]; for (const e of snap) onupdate?.(translate(e, dx, 0)) }
	function setY(v: number) { if (!gb) return; const dy = v - gb.y, snap = [...ents]; for (const e of snap) onupdate?.(translate(e, 0, dy)) }
	// Single-entity size edits (anchored at the top-left / centre).
	const boxKind = (e?: Ent | null) => e?.type === 'rect' || e?.type === 'ellipse'
	function setW(v: number) {
		const e = single; if (!boxKind(e)) return
		const x0 = Math.min(e!.a![0], e!.b![0]), y0 = Math.min(e!.a![1], e!.b![1]), h = Math.abs(e!.b![1] - e!.a![1])
		onupdate?.({ ...e!, a: [x0, y0], b: [x0 + Math.max(1, v), y0 + h] })
	}
	function setH(v: number) {
		const e = single; if (!boxKind(e)) return
		const x0 = Math.min(e!.a![0], e!.b![0]), y0 = Math.min(e!.a![1], e!.b![1]), w = Math.abs(e!.b![0] - e!.a![0])
		onupdate?.({ ...e!, a: [x0, y0], b: [x0 + w, y0 + Math.max(1, v)] })
	}
	function setText(v: string) { const e = single; if (e?.type === 'text') onupdate?.({ ...e, text: v }) }
	// Toggle a text box into a CALLOUT (box + leader). Seed the leader tip below-left of the text the
	// first time; keep it across off/on so re-enabling restores the previous target.
	function setCallout(on: boolean) {
		const e = single; if (e?.type !== 'text') return
		if (on) onupdate?.({ ...e, callout: true })   // leave `leader` undefined → the Viewport places its paperMm-based default (B3)
		else onupdate?.({ ...e, callout: false })
	}
	function setRot(v: number) { const r = ((Math.round(v) % 360) + 360) % 360; setAll({ rot: r || undefined }) }
	const num = (e: Event) => +(e.currentTarget as HTMLInputElement).value
	const strVal = (e: Event) => (e.currentTarget as HTMLInputElement).value
	// XP26: frames are stored in paper px; the panel shows / takes paper mm (1 decimal).
	const mmOf = (px: number) => Math.round((px / PAPER_PX_PER_MM) * 10) / 10
	const pxOf = (mm: number) => Math.round(mm * PAPER_PX_PER_MM)
	const MIN_FRAME_PX = 60   // ≈ 26 mm — PaperPage's own minimum
	// XP19: "1:137", "1 : 137" or "137" → 137 (a positive whole number), else null.
	const parseScale = (v: string): number | null => { const m = /^\s*(?:1\s*:\s*)?(\d+)\s*$/.exec(v); const n = m ? Number(m[1]) : NaN; return n >= 1 ? n : null }

	// ── style (color / fill / weight / font / align) — applies to the whole selection ──
	const STROKE_TYPES = new Set(['polyline', 'dim', 'rect', 'ellipse'])
	const FILL_TYPES = new Set(['rect', 'ellipse', 'polyline'])
	let anyText = $derived(ents.some((e) => e.type === 'text'))
	let anyStroke = $derived(ents.some((e) => STROKE_TYPES.has(e.type)))
	let anyFillable = $derived(ents.some((e) => FILL_TYPES.has(e.type)))
	// common value across the selection (undefined = mixed / unset)
	function cc<K extends keyof Ent>(k: K): Ent[K] | undefined { const v = new Set(ents.map((e) => e[k])); return v.size === 1 ? ents[0][k] : undefined }
	let mixedColor = $derived(new Set(ents.map((e) => e.color)).size > 1)
	let mixedFill = $derived(new Set(ents.map((e) => e.fill)).size > 1)
	function setAll(patch: Partial<Ent>) { const snap = [...ents]; for (const e of snap) onupdate?.({ ...e, ...patch }) }
	function setLayer(v: string) { setAll({ layer: v || undefined }) }
	const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
	// Enter / Shift-Enter in a field jumps to the next / previous field in the panel (textareas keep
	// Enter for newlines). Fields opt in with class="navf".
	function fnav(e: KeyboardEvent) {
		if (e.key !== 'Enter' || (e.currentTarget as HTMLElement).tagName === 'TEXTAREA') return
		e.preventDefault()
		const fields = [...document.querySelectorAll<HTMLElement>('.pp .navf')].filter((el) => !(el as HTMLInputElement).disabled)
		const i = fields.indexOf(e.currentTarget as HTMLElement)
		const nx = fields[i + (e.shiftKey ? -1 : 1)]
		if (nx) { nx.focus(); (nx as HTMLInputElement).select?.() }
	}
	// Grow the text textarea to fit its content (and on every input).
	function autoresize(el: HTMLTextAreaElement) {
		const grow = () => { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' }
		grow(); el.addEventListener('input', grow)
		return { destroy() { el.removeEventListener('input', grow) } }
	}
</script>

<!-- one labelled number cell for the compact X/Y/Z · W/D/H vector rows -->
{#snippet numcell(k: string, v: number, set?: (n: number) => void)}
	<label class="vcell"><em>{k}</em>
		<input class:navf={!!set} type="number" value={v} readonly={!set} onkeydown={set ? fnav : undefined} onchange={(e) => set?.(num(e))} />
	</label>
{/snippet}

{#key selKey}
<div class="pp">
	{#if frameObj}
		<!-- a sheet VIEWPORT FRAME is selected → edit its source model + view (projection / scale / border) -->
		<div class="prop-sec">VIEWPORT</div>
		{#if modelList.length > 1}
			<div class="prop"><span>Source</span>
				<select value={frameObj.modelId ?? modelList[0]?.id} onchange={(e) => onframeupdate?.({ modelId: (e.currentTarget as HTMLSelectElement).value })}>
					{#each modelList as m (m.id)}<option value={m.id}>{m.name}</option>{/each}
				</select>
			</div>
		{/if}
		<div class="prop"><span>View</span>
			<select value={frameObj.proj} onchange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value as Proj; onframeupdate?.({ proj: v, label: PROJ_OPTS.find(([pv]) => pv === v)?.[1] }) }}>
				{#each PROJ_OPTS as [v, l] (v)}<option value={v}>{l}</option>{/each}
			</select>
		</div>
		<!-- XP19: any 1:N (type "1:137" or "137"; the list offers the standard ones) + Fit to the model -->
		<div class="prop"><span>Scale</span>
			<span class="pp-scale">
				<input list="pp-scales" value={frameObj.scale} title="Any scale — 1:N or just N"
					onchange={(e) => { const n = parseScale((e.currentTarget as HTMLInputElement).value); if (n) onframeupdate?.({ scale: `1:${n}` }); else (e.currentTarget as HTMLInputElement).value = frameObj!.scale }} />
				<button class="pp-mini" title="Fit: the scale that shows the whole model, centred" onclick={() => onframefit?.()}>Fit</button>
			</span>
			<datalist id="pp-scales">{#each SCALES as s (s)}<option value={s}></option>{/each}</datalist>
		</div>
		<div class="prop"><span>Border</span>
			<select value={frameObj.border} onchange={(e) => onframeupdate?.({ border: (e.currentTarget as HTMLSelectElement).value as 'dashed' | 'solid' | 'none' })}>
				<option value="solid">Solid</option><option value="dashed">Dashed</option><option value="none">None</option>
			</select>
		</div>
		<!-- a riser drawing: which floors this building elevation shows (the rest collapse to a break) -->
		{#if frameStoreys.length && frameObj.proj !== 'plan' && frameObj.proj !== 'iso'}
			{@const shown = new Set(frameObj.storeys ?? frameStoreys.map((s) => s.id))}
			<div class="prop-sec">FLOORS<span class="sec-hint">hidden floors collapse to a break</span>
				<button class="pp-mini sec-btn" onclick={() => onframeupdate?.({ storeys: undefined })}>All</button></div>
			<div class="pp-floors">
				{#each [...frameStoreys].reverse() as s (s.id)}
					<label><input type="checkbox" checked={shown.has(s.id)} onchange={(e) => {
						const on = (e.currentTarget as HTMLInputElement).checked, next = frameStoreys.map((x) => x.id).filter((id) => (id === s.id ? on : shown.has(id)))
						onframeupdate?.({ storeys: next.length === frameStoreys.length ? undefined : next })
					}} />{s.name}</label>
				{/each}
			</div>
		{/if}
		<!-- XP26: frame position / size in PAPER MM (stored as paper px); XP22: a locked frame can't move -->
		<div class="prop-sec">FRAME · mm</div>
		<label class="prop cb"><span>Lock</span><input type="checkbox" checked={!!frameObj.locked} onchange={(e) => onframeupdate?.({ locked: (e.currentTarget as HTMLInputElement).checked || undefined })} /></label>
		{#if frameObj.locked}
			<div class="vecrow">
				<div class="pp-ro">X {mmOf(frameObj.x)}</div><div class="pp-ro">Y {mmOf(frameObj.y)}</div>
			</div>
			<div class="vecrow">
				<div class="pp-ro">W {mmOf(frameObj.w)}</div><div class="pp-ro">H {mmOf(frameObj.h)}</div>
			</div>
		{:else}
			<div class="vecrow">
				{@render numcell('X', mmOf(frameObj.x), (n) => onframeupdate?.({ x: pxOf(n) }))}
				{@render numcell('Y', mmOf(frameObj.y), (n) => onframeupdate?.({ y: pxOf(n) }))}
			</div>
			<div class="vecrow">
				{@render numcell('W', mmOf(frameObj.w), (n) => onframeupdate?.({ w: Math.max(MIN_FRAME_PX, pxOf(n)) }))}
				{@render numcell('H', mmOf(frameObj.h), (n) => onframeupdate?.({ h: Math.max(MIN_FRAME_PX, pxOf(n)) }))}
			</div>
		{/if}
		<button class="pp-del" onclick={() => onframedelete?.()}>Delete viewport</button>
		<div class="pp-hint">A viewport is a window onto the model. Double-click it to edit inside; change the view or scale here.</div>
	{:else if modelObj}
		<!-- a 3D MODEL object is selected → edit its geometry + layer straight on the store -->
		<div class="prop-sec">{modelTypeLabel(modelObj)}</div>
		<!-- a name drawn with the object in plan / elevations (e.g. an imported riser room "IDF01-A") -->
		<div class="prop"><span>Label</span><input value={modelObj.label ?? ''} placeholder="(none)"
			onchange={(e) => onmodelupdate?.({ label: (e.currentTarget as HTMLInputElement).value.trim() || undefined })}
			onkeydown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur() }} /></div>
		<div class="prop"><span>Layer</span>
			<select value={modelObj.layer ?? ''} onchange={(e) => onmodelupdate?.({ layer: (e.currentTarget as HTMLSelectElement).value || undefined })}>
				{#each modelLayers as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
			</select>
		</div>
		{#if modelObj.type === 'prism'}
			<div class="prop-sec">POSITION</div>
			<div class="vecrow">
				{@render numcell('X', Math.round(modelObj.x), (n) => onmodelupdate?.({ x: n }))}
				{@render numcell('Y', Math.round(modelObj.y), (n) => onmodelupdate?.({ y: n }))}
				{@render numcell('Z', Math.round(modelObj.z), (n) => onmodelupdate?.({ z: Math.max(0, n) }))}
			</div>
			<div class="prop-sec">SIZE</div>
			<div class="vecrow">
				{@render numcell('W', Math.round(modelObj.w), (n) => onmodelupdate?.({ w: Math.max(1, n) }))}
				{@render numcell('D', Math.round(modelObj.d), (n) => onmodelupdate?.({ d: Math.max(1, n) }))}
				{@render numcell('H', Math.round(modelObj.h), (n) => onmodelupdate?.({ h: Math.max(1, n) }))}
			</div>
			<div class="prop"><span>Shape</span>
				<select value={modelObj.edges <= 4 ? '4' : modelObj.edges >= 16 ? '16' : String(modelObj.edges)} onchange={(e) => onmodelupdate?.({ edges: +(e.currentTarget as HTMLSelectElement).value })}>
					<option value="4">Box</option><option value="16">Cylinder</option>
					{#if modelObj.edges > 4 && modelObj.edges < 16}<option value={String(modelObj.edges)}>{modelObj.edges}-gon</option>{/if}
				</select>
			</div>
			<div class="prop"><span>Sides</span><input type="number" min="3" max="24" value={modelObj.edges} onchange={(e) => onmodelupdate?.({ edges: Math.max(3, Math.min(24, Math.round(num(e)))) })} /></div>
			<div class="prop-sec">ROTATION · degrees</div>
			<div class="vecrow">
				{@render numcell('X', Math.round(modelObj.rotX ?? 0), (n) => onmodelupdate?.({ rotX: n || undefined }))}
				{@render numcell('Y', Math.round(modelObj.rotY ?? 0), (n) => onmodelupdate?.({ rotY: n || undefined }))}
				{@render numcell('Z', Math.round(modelObj.rot ?? 0), (n) => onmodelupdate?.({ rot: n || undefined }))}
			</div>
			{#if modelLayers.find((l) => l.id === modelObj.layer)?.opening}
				<div class="prop-sec">OPENING</div>
				<div class="prop"><span>Type</span>
					<select value={modelObj.open ?? 'hole'} onchange={(e) => onmodelupdate?.({ open: (e.currentTarget as HTMLSelectElement).value })}>
						<option value="door">Door</option><option value="window">Window</option><option value="hole">Hole</option>
					</select>
				</div>
				{#if (modelObj.open ?? 'hole') === 'door'}
					<div class="prop"><span>Swing°</span><input type="number" min="0" max="180" value={modelObj.swing ?? 90} onchange={(e) => onmodelupdate?.({ swing: Math.max(0, Math.min(180, Math.round(num(e)))) })} /></div>
					<div class="prop"><span>Hinge</span>
						<span class="pp-seg">
							<button class:on={!modelObj.flip} title="Hinge left" onclick={() => onmodelupdate?.({ flip: false })}>L</button>
							<button class:on={!!modelObj.flip} title="Hinge right" onclick={() => onmodelupdate?.({ flip: true })}>R</button>
						</span>
					</div>
				{/if}
			{/if}
		{:else if modelObj.type === 'wall'}
			<div class="prop-sec">DEFAULTS</div>
			<div class="prop"><span>Height</span><input type="number" value={modelObj.h} onchange={(e) => onmodelupdate?.({ h: Math.max(1, num(e)) })} /></div>
			<div class="prop"><span>Thickness</span><input type="number" value={modelObj.thickness} onchange={(e) => onmodelupdate?.({ thickness: Math.max(1, num(e)) })} /></div>
			<div class="prop-sec">SEGMENTS ({modelObj.segments.length})<span class="sec-hint" title="Total wall length">L {fmtLen(modelObj.segments.reduce((t, s) => t + segLen(modelObj!, s), 0))}</span></div>
			{#each modelObj.segments as s, si (s.id)}
				<div class="seg-row"><em>{si + 1}</em>
					<label>t<input type="number" value={s.thickness ?? modelObj.thickness} placeholder={String(modelObj.thickness)} onchange={(e) => onmodelseg?.(si, { thickness: Math.max(1, num(e)) })} /></label>
					<label>h<input type="number" value={s.h ?? modelObj.h} placeholder={String(modelObj.h)} onchange={(e) => onmodelseg?.(si, { h: Math.max(1, num(e)) })} /></label>
					<span class="seg-len" title="Length">L {fmtLen(segLen(modelObj, s))}</span>
				</div>
			{/each}
		{:else if modelObj.type === 'conduit'}
			<div class="prop-sec">DEFAULTS</div>
			<div class="prop"><span>Width</span><input type="number" value={modelObj.w} onchange={(e) => onmodelupdate?.({ w: Math.max(1, num(e)) })} /></div>
			<div class="prop"><span>Height</span><input type="number" value={modelObj.h} onchange={(e) => onmodelupdate?.({ h: Math.max(1, num(e)) })} /></div>
			<div class="prop"><span>Profile</span>
				<select value={modelObj.edges === 4 ? '4' : '16'} onchange={(e) => onmodelupdate?.({ edges: +(e.currentTarget as HTMLSelectElement).value })}>
					<option value="4">Rectangular</option><option value="16">Round</option>
				</select>
			</div>
			<div class="prop"><span>Bend r</span><input type="number" min="0" value={modelObj.bend ?? 0} title="Corner fillet radius (mm) — rounds all corners" onchange={(e) => onmodelupdate?.({ bend: Math.max(0, num(e)) })} /></div>
			<!-- L = the segment's TRUE 3D length (model mm) — floors hidden in a riser drawing don't shorten it -->
			<div class="prop-sec">SEGMENTS ({modelObj.segments.length})<span class="sec-hint" title="Total run length">L {fmtLen(modelObj.segments.reduce((t, s) => t + segLen(modelObj!, s), 0))}</span></div>
			{#each modelObj.segments as s, si (s.id)}
				<div class="seg-row"><em>{si + 1}</em>
					<label>w<input type="number" value={s.w ?? modelObj.w} placeholder={String(modelObj.w)} onchange={(e) => onmodelseg?.(si, { w: Math.max(1, num(e)) })} /></label>
					<label>h<input type="number" value={s.h ?? modelObj.h} placeholder={String(modelObj.h)} onchange={(e) => onmodelseg?.(si, { h: Math.max(1, num(e)) })} /></label>
					<span class="seg-len" title="Length (3D)">L {fmtLen(segLen(modelObj, s))}</span>
				</div>
			{/each}
		{/if}
		<button class="pp-del" onclick={() => onmodeldelete?.()}>Delete object</button>
		<div class="pp-hint">Editing writes straight to the 3D model. Reshape geometry by dragging its grips.</div>
	{:else if ents.length === 0 && node}
		<!-- a tree node is selected → its place properties (mock) -->
		{#if nodeInfo}
			<!-- a REAL tree node (Firestore): editable fields save to the project doc on change; the rest is read-only
			     data from the backend (racks / risers / drawings registry) — projectProps.ts -->
			{#each nodeInfo.sections as sec (sec.label)}
				<div class="prop-sec">{sec.label}</div>
				{#each sec.fields as f (f.key)}
					{#if f.edit === 'checklist'}
						{@const ticked = new Set(f.value.split(',').map((x) => x.trim()).filter(Boolean))}
						<div class="prop"><span>{f.label}</span>
							<details class="pp-check" title={f.hint}>
								<summary>{f.value || 'none'}</summary>
								<div class="pp-check-grid">
									{#each [...(f.options ?? [])].reverse() as o (o)}
										<label><input type="checkbox" checked={ticked.has(o)} onchange={(e) => {
											const on = (e.currentTarget as HTMLInputElement).checked
											onnodefield?.(f.key, (f.options ?? []).filter((x) => (x === o ? on : ticked.has(x))).join(', '))
										}} />{o}</label>
									{/each}
								</div>
							</details></div>
					{:else if f.edit === 'textarea'}
						<div class="prop wide"><span>{f.label}</span>
							<textarea class="pp-textarea" use:autoresize value={f.value} title={f.hint}
								onchange={(e) => onnodefield?.(f.key, (e.currentTarget as HTMLTextAreaElement).value)}></textarea></div>
					{:else if f.edit}
						<div class="prop"><span>{f.label}</span>
							<input value={f.value} placeholder={f.hint} title={f.hint}
								onchange={(e) => onnodefield?.(f.key, (e.currentTarget as HTMLInputElement).value)}
								onkeydown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur() }} /></div>
					{:else}
						<div class="prop"><span>{f.label}</span><div class="pp-val" title={f.value}>{f.value}</div></div>
					{/if}
				{/each}
				{#if sec.hint}<div class="sec-help">{sec.hint}</div>{/if}
			{/each}
			{#if heights?.rows.length}
				<!-- a building's per-floor heights (its building model's storeys) — an edit re-stacks the floors above -->
				<div class="prop-sec">HEIGHTS · mm<button class="pp-mini sec-btn edit-btn" onclick={() => (heightsOpen = true)}><Icon name="edit" size={11} /> Edit heights…</button></div>
				<div class="pp-heights">
					<table>
						<thead><tr><th></th><th title="Structural slab thickness">Slab</th><th title="Raised floor height">Raised</th><th title="Clear height (floor to ceiling)">Clear</th><th title="Plenum (ceiling void)">Plenum</th><th title="Slab top above the lowest floor">Level (m)</th></tr></thead>
						<tbody>
							{#each heights.rows as r (r.id)}
								<tr><th>{r.name}</th><td>{r.slabMm}</td><td>{r.raisedFloorMm}</td><td>{r.clearHeightMm}</td><td>{r.plenumMm}</td><td class="lvl">{(r.z / 1000).toFixed(2)}</td></tr>
							{/each}
						</tbody>
					</table>
				</div>
				{#if heightsOpen}
					<HeightsDialog title={node?.label ?? ''} rows={heights.rows} onclose={() => (heightsOpen = false)}
						onheight={(id, k, v) => onheight?.(heights!.placeId, id, k, v)} onall={(k, v) => onheightall?.(heights!.placeId, k, v)} />
				{/if}
			{/if}
			<div class="pp-hint">{nodeInfo.note ?? 'Edits save to the project in Firestore.'}</div>
		{:else}
			<div class="prop-sec">{kindLabel[node.kind] ?? 'ITEM'}</div>
			<div class="prop"><span>Name</span><input value={node.label} /></div>
			{#each NODE_FIELDS[node.kind] ?? [] as [label, ph] (label)}
				<div class="prop"><span>{label}</span><input value={ph} /></div>
			{/each}
			<div class="pp-hint">Editing these is mock-only for now.</div>
		{/if}
	{:else if ents.length === 0}
		<!-- nothing selected → page / general props (mock) -->
		<div class="prop-sec">PAGE</div>
		<div class="prop"><span>Name</span><input value={pageTitle} onchange={(e) => onpagetitle?.((e.currentTarget as HTMLInputElement).value)}
			onkeydown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur() }} /></div>
		<div class="prop"><span>Type</span><input value={pageKind} readonly /></div>
		{#if sheetInfo}
			<div class="prop"><span>Dwg №</span><input value={sheetInfo.number} placeholder="(none)" onchange={(e) => onsheetfield?.('drawingNumber', (e.currentTarget as HTMLInputElement).value.trim())}
				onkeydown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur() }} /></div>
			<div class="prop"><span>Drawn</span><input value={sheetInfo.drawnBy} placeholder={sheetInfo.drawnDefault || '(none)'} onchange={(e) => onsheetfield?.('drawnBy', (e.currentTarget as HTMLInputElement).value.trim())}
				onkeydown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur() }} /></div>
		{/if}
		<div class="prop"><span>Layer</span><input value={activeLayer} readonly /></div>
		{#if pageKind === 'sheet' && ontitleblock}
			<TitleBlockEditor template={titleBlock} onchange={ontitleblock} />
		{:else}
			<div class="pp-hint">Select an object to edit its properties, or a place in the tree.</div>
		{/if}
	{:else}
		<div class="prop-sec">{ents.length === 1 ? 'OBJECT' : `${ents.length} OBJECTS`}</div>
		<div class="prop"><span>Type</span><input value={typeLabel} readonly /></div>
		<div class="prop-sec">POSITION</div>
		<div class="vecrow">
			{@render numcell('X', r1(gb!.x), setX)}
			{@render numcell('Y', r1(gb!.y), setY)}
		</div>
		<div class="prop-sec">SIZE</div>
		<div class="vecrow">
			{#if boxKind(single)}
				{@render numcell('W', r1(Math.abs(single!.b![0] - single!.a![0])), setW)}
				{@render numcell('H', r1(Math.abs(single!.b![1] - single!.a![1])), setH)}
			{:else}
				{@render numcell('W', r1(gb!.w))}
				{@render numcell('H', r1(gb!.h))}
			{/if}
		</div>
		<div class="prop-sec">ROTATION · degrees</div>
		<div class="vecrow">
			{@render numcell('∠', Math.round((cc('rot') as number | undefined) ?? 0), setRot)}
			<span class="vspacer"></span><span class="vspacer"></span>
		</div>
		<div class="prop-sec">ARRANGE</div>
		<div class="prop"><span>Draw order</span>
			<span class="pp-seg">
				<button title="Send to back (Ctrl+Shift+[)" onclick={() => onarrange?.('back')}>⤓</button>
				<button title="Send backward (Ctrl+[)" onclick={() => onarrange?.('backward')}>▽</button>
				<button title="Bring forward (Ctrl+])" onclick={() => onarrange?.('forward')}>△</button>
				<button title="Bring to front (Ctrl+Shift+])" onclick={() => onarrange?.('front')}>⤒</button>
			</span>
		</div>
		{#if single?.type === 'text'}
			<div class="prop-sec">TEXT</div>
			<div class="prop wide"><textarea class="pp-textarea" use:autoresize value={single.text ?? ''} onchange={(e) => setText((e.currentTarget as HTMLTextAreaElement).value)}></textarea></div>
			<label class="prop cb"><span>Callout</span><input type="checkbox" checked={!!single.callout} onchange={(e) => setCallout((e.currentTarget as HTMLInputElement).checked)} /></label>
		{/if}
		{#if single?.type === 'rect'}
			<div class="prop-sec">RECT</div>
			<label class="prop cb"><span>Revision cloud</span><input type="checkbox" checked={!!single.cloud} onchange={(e) => setAll({ cloud: (e.currentTarget as HTMLInputElement).checked })} /></label>
		{/if}
		{#if (single?.type === 'polyline' && (single.pts?.length ?? 0) === 2) || single?.type === 'dim'}
			<!-- XP33: a head per end (arrow / dot / tick / none) — a 2-point line defaults to none, a dimension
			     to arrow. (R4: a straight 2-point polyline is the retired 'line' type's replacement.) -->
			{@const dflt = single.type === 'dim' ? 'arrow' : 'none'}
			<div class="prop-sec">{single.type === 'dim' ? 'DIMENSION' : 'LINE'}</div>
			{#each [['Start', 'headStart'], ['End', 'headEnd']] as const as [lbl, key] (key)}
				<div class="prop"><span>{lbl}</span>
					<select value={single[key] ?? dflt} onchange={(e) => setAll({ [key]: (e.currentTarget as HTMLSelectElement).value as Head })}>
						<option value="none">None</option><option value="arrow">Arrow</option><option value="dot">Dot</option><option value="tick">Tick</option>
					</select>
				</div>
			{/each}
		{/if}
		{#if single?.type === 'insert'}
			<!-- a BLOCK insert: swap its block (same category — e.g. rosette / wall mount / floorbox) keeping its
			     attributes, and edit the attribute values -->
			{@const def = blockDef(single.block)}
			{@const ins = single}
			<div class="prop-sec">BLOCK</div>
			<div class="prop"><span>Block</span>
				<select value={ins.block ?? ''} onchange={(e) => onupdate?.({ ...ins, block: (e.currentTarget as HTMLSelectElement).value })}>
					{#each blockList().filter((b) => !def?.category || b.category === def.category) as b (b.id)}<option value={b.id}>{b.name}</option>{/each}
					{#if !def}<option value={ins.block ?? ''}>{ins.block} (missing)</option>{/if}
				</select></div>
			{#each def?.attributes ?? [] as ad (ad.tag)}
				<div class="prop"><span>{ad.label}</span><input value={ins.attrs?.[ad.tag] ?? ad.default ?? ''}
					onchange={(e) => onupdate?.({ ...ins, attrs: { ...(ins.attrs ?? {}), [ad.tag]: (e.currentTarget as HTMLInputElement).value } })}
					onkeydown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur() }} /></div>
			{/each}
		{/if}
		{#if single?.type === 'image'}
			<!-- imported file: origin = Position, scale = Size (above); here opacity (for tracing) + CROP
			     (visible sub-rect of the source, as %). Real backend stores these against the fileId (§4). -->
			{@const cr = single.crop ?? { x: 0, y: 0, w: 1, h: 1 }}
			<div class="prop-sec">IMAGE</div>
			<div class="prop"><span>Opacity %</span><input class="navf" type="number" min="10" max="100" step="5" value={Math.round((single.opacity ?? 1) * 100)} onkeydown={fnav} onchange={(e) => setAll({ opacity: Math.max(0.05, Math.min(1, num(e) / 100)) })} /></div>
			<!-- calibration modes (Uploads-tool model): each toggles a Viewport interaction on the image. -->
			<div class="prop"><span>Calibrate</span>
				<span class="pp-seg wide">
					<button class:on={imgEdit.mode === 'origin' && imgEdit.id === single.id} title="Click a reference point inside the image" onclick={() => setImgMode('origin', single!.id)}>Origin</button>
					<button class:on={imgEdit.mode === 'scale' && imgEdit.id === single.id} title="Draw a line across a known distance, then enter it" onclick={() => setImgMode('scale', single!.id)}>Scale</button>
					<button class:on={imgEdit.mode === 'crop' && imgEdit.id === single.id} title="Drag the corner handles to crop" onclick={() => setImgMode('crop', single!.id)}>Crop</button>
				</span>
			</div>
			<div class="prop-sec">CROP · %</div>
			<div class="vecrow">
				{@render numcell('X', Math.round(cr.x * 100), (n) => setAll({ crop: { ...cr, x: clamp01(n / 100) } }))}
				{@render numcell('Y', Math.round(cr.y * 100), (n) => setAll({ crop: { ...cr, y: clamp01(n / 100) } }))}
			</div>
			<div class="vecrow">
				{@render numcell('W', Math.round(cr.w * 100), (n) => setAll({ crop: { ...cr, w: Math.max(0.05, clamp01(n / 100)) } }))}
				{@render numcell('H', Math.round(cr.h * 100), (n) => setAll({ crop: { ...cr, h: Math.max(0.05, clamp01(n / 100)) } }))}
			</div>
			<button class="pp-reset" onclick={() => setAll({ crop: undefined })}>Reset crop</button>
		{/if}
		<div class="prop-sec">STYLE</div>
		<!-- R5: entities pick from the model's one layer list, the same list as model objects -->
		<div class="prop"><span>Layer</span>
			<select class="navf" value={(cc('layer') as string | undefined) ?? ''} onkeydown={fnav} onchange={(e) => setLayer(strVal(e))}>
				<option value="">— none —</option>
				{#each modelLayers as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
			</select>
		</div>
		{#if activeFrameId}
			<!-- SCOPE (§6): model-space shows in every view of the model; view-space shows only in this viewport. -->
			<div class="prop"><span>Scope</span>
				<select value={(cc('space') as string | undefined)?.startsWith('view:') ? 'view' : 'model'} onchange={(e) => setAll({ space: strVal(e) === 'view' ? 'view:' + activeFrameId : 'model' })}>
					<option value="model">Model (all views)</option>
					<option value="view">This viewport only</option>
				</select>
			</div>
		{/if}
		<div class="prop"><span>Color</span>
			<ColorPicker value={cc('color') as string | undefined} colors={COLORS} allowByLayer mixed={mixedColor} onchange={(v) => setAll({ color: v })} />
		</div>
		{#if anyStroke}
			<!-- XP32: line type; ByLayer = the layer's own dash (unset) -->
			<div class="prop"><span>Line type</span>
				<select class="navf" value={(cc('dash') as string | undefined) ?? ''} onkeydown={fnav} onchange={(e) => setAll({ dash: (strVal(e) || undefined) as Dash | undefined })}>
					<option value="">ByLayer</option><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option><option value="dashdot">Dash-dot</option>
				</select>
			</div>
			<div class="prop"><span>Weight</span><input class="navf" type="number" min="0.1" step="0.1" value={(cc('weight') as number | undefined) ?? STYLE_DEFAULTS.weight} onkeydown={fnav} onchange={(e) => setAll({ weight: Math.max(0.1, num(e)) })} /></div>
		{/if}
		{#if anyFillable}
			<div class="prop"><span>Fill</span>
				<ColorPicker value={(cc('fill') as string | undefined) ?? 'none'} colors={COLORS} allowNone mixed={mixedFill} onchange={(v) => setAll({ fill: v ?? 'none' })} />
			</div>
		{/if}
		{#if anyText}
			<div class="prop"><span>Font (pt)</span><input class="navf" type="number" min="2" max="96" value={(cc('fontPt') as number | undefined) ?? STYLE_DEFAULTS.fontPt} onkeydown={fnav} onchange={(e) => setAll({ fontPt: Math.max(2, Math.round(num(e))) })} /></div>
			<div class="prop"><span>Align</span>
				<span class="pp-seg">
					{#each ['left', 'center', 'right'] as const as al (al)}
						<button class:on={(cc('align') ?? 'left') === al} title="{al} align" onclick={() => setAll({ align: al as TextAlign })}>{al[0].toUpperCase()}</button>
					{/each}
				</span>
			</div>
			<div class="prop"><span>V-align</span>
				<span class="pp-seg">
					{#each ['top', 'middle', 'bottom'] as const as va (va)}
						<button class:on={(cc('valign') ?? 'top') === va} title="{va} align" onclick={() => setAll({ valign: va as VAlign })}>{va[0].toUpperCase()}</button>
					{/each}
				</span>
			</div>
		{/if}
		<div class="pp-hint">{ents.length > 1 ? 'Style + position apply to the whole selection.' : 'Editing writes straight to the object.'} New objects use Sheets’ defaults ({STYLE_DEFAULTS.fontPt}pt, left).</div>
	{/if}
</div>
{/key}

<style>
	.pp-val { font-size:11px; color:var(--muted); font-family:Consolas,monospace; padding:3px 0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; }
	.pp-scale { display:flex; gap:4px; min-width:0; }
	.pp-scale input { flex:1; min-width:0; }
	.pp-mini { font-size:10px; padding:2px 7px; border-radius:4px; color:var(--text); background:var(--input); border:1px solid var(--line); cursor:pointer; }
	.pp-mini:hover { border-color:var(--accent); }
	.pp-ro { font-size:11px; color:var(--muted); font-family:Consolas,monospace; padding:3px 6px; }
	.pp { flex:1; overflow-y:auto; padding:5px; min-height:0; scrollbar-width:thin; scrollbar-color:var(--line) transparent; }
	.prop-sec { font-size:9px; text-transform:uppercase; letter-spacing:.1em; color:var(--faint); padding:8px 4px 4px; }
	.prop { display:grid; grid-template-columns:64px 1fr; align-items:center; gap:6px; padding:2px 4px; }
	.prop.wide { grid-template-columns:1fr; }
	.prop span { color:var(--muted); font-size:11px; }
	.prop input, .prop select { background:var(--input); color:var(--text); border:1px solid var(--line); border-radius:4px; padding:3px 6px; font-size:11px; font-family:Consolas,monospace; min-width:0; }
	.prop input:read-only { color:var(--muted); }
	.pp-textarea { width:100%; min-height:32px; resize:vertical; overflow:hidden; background:var(--input); color:var(--text); border:1px solid var(--line); border-radius:4px; padding:4px 6px; font-size:11px; font-family:'Consolas','SF Mono',ui-monospace,monospace; }
	.pp-textarea:focus { outline:none; border-color:var(--accent); }
	.prop input:focus, .prop select:focus { outline:none; border-color:var(--accent); }
	.cb { cursor:pointer; }
	.cb input { width:16px; height:16px; padding:0; justify-self:start; accent-color:var(--accent); }
	.sec-btn { float:right; text-transform:none; letter-spacing:0; }
	.edit-btn { display:inline-flex; align-items:center; gap:4px; color:var(--accent); border-color:var(--accent); font-size:11px; padding:2px 8px; }
	.edit-btn:hover { background:var(--active); }
	.pp-floors { display:grid; grid-template-columns:repeat(3, 1fr); gap:1px 6px; padding:2px 8px 4px; max-height:170px; overflow-y:auto; font-size:11px; color:var(--text); }
	.pp-floors label { display:flex; align-items:center; gap:4px; cursor:pointer; }
	.pp-floors input { accent-color:var(--accent); }
	.pp-heights { padding:0 4px; }
	.pp-heights table { width:100%; border-collapse:collapse; font-size:10px; }
	.pp-heights th { font-weight:500; color:var(--muted); text-align:left; padding:1px 2px; }
	.pp-heights tbody th { font-family:Consolas,monospace; color:var(--text); }
	.pp-heights td { padding:1px 2px; font-family:Consolas,monospace; color:var(--text); text-align:right; }
	.pp-heights thead th:not(:first-child) { text-align:right; }
	.pp-heights td.lvl { color:var(--muted); font-family:Consolas,monospace; text-align:right; }
	.pp-check { min-width:0; }
	.pp-check summary { cursor:pointer; background:var(--input); border:1px solid var(--line); border-radius:4px; padding:3px 6px; font-size:11px; font-family:Consolas,monospace; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
	.pp-check[open] summary { border-color:var(--accent); }
	.pp-check-grid { display:grid; grid-template-columns:repeat(3, 1fr); gap:1px 6px; padding:4px 2px; max-height:180px; overflow-y:auto; font-size:11px; color:var(--text); }
	.pp-check-grid label { display:flex; align-items:center; gap:4px; cursor:pointer; }
	.pp-check-grid input { accent-color:var(--accent); }
	.sec-help { font-size:10px; color:var(--faint); line-height:1.4; padding:2px 6px 4px 74px; }
	.sec-hint { margin-left:6px; text-transform:none; letter-spacing:0; font-size:10px; color:var(--muted); }
	.pp-hint { font-size:10px; color:var(--faint); padding:10px 6px; line-height:1.4; }
	.seg-row { display:flex; align-items:center; gap:5px; padding:1px 6px; }
	.seg-row em { width:14px; font-style:normal; color:var(--faint); font-size:10px; text-align:right; }
	.seg-row label { display:flex; align-items:center; gap:3px; flex:1; font-size:10px; color:var(--faint); }
	.seg-row input { width:100%; min-width:0; }
	.seg-len { flex:0 0 58px; font-size:10px; color:var(--muted); font-family:Consolas,monospace; text-align:right; white-space:nowrap; }
	.pp-del { margin:10px 6px 4px; width:calc(100% - 12px); padding:6px; background:#7f1d1d33; color:#ef4444; border:1px solid #ef444455; border-radius:5px; cursor:pointer; font-size:12px; }
	.pp-del:hover { background:#7f1d1d55; }
	.pp-reset { margin:6px 6px 4px; width:calc(100% - 12px); padding:5px; background:var(--panel2); color:var(--muted); border:1px solid var(--line); border-radius:5px; cursor:pointer; font-size:11px; }
	.pp-reset:hover { background:var(--hover); color:var(--text); }
	/* compact X/Y/Z · W/D/H vector rows */
	.vecrow { display:flex; gap:5px; padding:2px 4px; }
	.vcell { flex:1; min-width:0; display:flex; align-items:center; gap:4px; }
	.vcell em { font-style:normal; color:var(--faint); font-size:10px; font-weight:600; width:10px; flex:0 0 auto; text-align:center; }
	.vcell input { width:100%; min-width:0; background:var(--input); color:var(--text); border:1px solid var(--line); border-radius:4px; padding:3px 4px; font-size:11px; font-family:Consolas,monospace; }
	.vcell input:read-only { color:var(--muted); }
	.vcell input:focus { outline:none; border-color:var(--accent); }
	.vspacer { flex:1; }
	/* L/C/R alignment segmented control */
	.pp-seg { display:flex; gap:2px; }
	.pp-seg button { flex:1; font-size:11px; font-weight:600; color:var(--muted); background:var(--input); border:1px solid var(--line); border-radius:4px; padding:2px 0; }
	.pp-seg button:hover { color:var(--text); border-color:var(--accent-dim); }
	.pp-seg button.on { color:var(--accent); border-color:var(--accent); background:var(--active); }
</style>
