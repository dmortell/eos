<script lang="ts">
	// Properties › the selected 2D SHAPES (entities) of the active document. One shape: its own fields (text,
	// callout, line label / length / heads, block + attributes, image calibration + crop). Several: the group's
	// bbox X/Y (moves all) and the style fields they share ("mixed" when they differ) — edits apply to all.
	import { ColorPicker } from '$lib'
	import { COLORS } from '../../palette'
	import NumCell from './NumCell.svelte'
	import { num, strVal, fnav, blurOnEnter, autoresize } from './fields'
	import { blockDef, insertBounds } from '../../ui/blocks'
	import { blockList } from '../../blocks.svelte'
	import { translate, textBox, arcPts, STYLE_DEFAULTS, type Ent, type Pt, type TextAlign, type VAlign, type Head, type Dash } from '../../ui/geometry'
	import { PT_MM } from '../../constants'
	import { imgEdit, setImgMode } from '../../imageEdit.svelte'
	import type { Layer as MLayer } from '../../3dview/types'
	import { autoNumber, numberable, type NumberOrder } from '../../ui/autoNumber'
	import { incLabel } from '../../ui/outletPlace.svelte'
	import { isOutletEnt } from '../../store/allocate'

	let { ents, onupdate, onarrange, layers = [], activeFrameId = undefined, scaleN = 1, sheets = [], onopenlink, onsaveblock, onwalk }: {
		ents: Ent[]; /** One shape, or several as ONE undo step. */ onupdate?: (e: Ent | Ent[]) => void; onarrange?: (op: 'front' | 'back' | 'forward' | 'backward') => void
		/** D4: the project's sheets (a symbol's LINK picker) + open a link (a sheet id or a URL). */
		sheets?: { id: string; title: string; number?: string }[]; onopenlink?: (link: string) => void
		/** D5: save the selection as a library block. */
		onsaveblock?: (name: string) => void
		/** E3: start a walk renumber seeded from this outlet's label. */
		onwalk?: (label: string) => void
		/** The model's one layer list (R5: shapes and model objects share it). */
		layers?: MLayer[]
		/** The active sheet frame, if any — offers the "this viewport only" scope. */
		activeFrameId?: string
		/** Scale denominator (the N of 1:N) of the viewport the selection is edited in — sizes the annotative
		 *  text bbox in model mm (B19). */
		scaleN?: number
	} = $props()

	// View-agnostic unrotated bbox (unlike ui/hit.ts bbox, no elevation collapse / crop window: the panel
	// shows the PLACEMENT). Text is annotative, so its box is the same one the Viewport draws and hits.
	function bbox(e: Ent): [number, number, number, number] {
		if (e.type === 'polyline' || e.type === 'arc') { const pts = e.type === 'arc' ? arcPts(e) : e.pts ?? []; const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] }
		if (e.type === 'text') return textBox(e, PT_MM * scaleN)
		if (e.type === 'insert') return insertBounds(e, scaleN)   // no `b`: the block's extent at the insertion point
		const xs = [e.a![0], e.b![0]], ys = [e.a![1], e.b![1]]
		return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
	}
	// Group bbox across the selection.
	const gb = $derived.by(() => {
		let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
		for (const e of ents) { const [a, b, c, d] = bbox(e); x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c); y1 = Math.max(y1, d) }
		return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
	})
	const single = $derived(ents.length === 1 ? ents[0] : null)
	const typeLabel = $derived(new Set(ents.map(e => e.type)).size === 1 ? ents[0].type : `Mixed (${ents.length})`)
	const r1 = (n: number) => Math.round(n * 10) / 10

	// Move the whole selection so the group bbox corner reaches v — all shapes in ONE update (one undo step).
	function setX(v: number) { const dx = v - gb.x; onupdate?.(ents.map((e) => translate(e, dx, 0))) }
	function setY(v: number) { const dy = v - gb.y; onupdate?.(ents.map((e) => translate(e, 0, dy))) }
	// Single-entity size edits (anchored at the top-left).
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
	// Toggle a text box into a CALLOUT (box + leader). Leave `leader` undefined → the Viewport places its
	// paperMm-based default (B3); it's kept across off/on so re-enabling restores the previous target.
	function setCallout(on: boolean) { const e = single; if (e?.type === 'text') onupdate?.({ ...e, callout: on }) }
	// D8: a dimension's (or a 2-point line's) length; typing one moves the END along the same direction.
	const ends = (e: Ent): [Pt, Pt] | null => e.type === 'dim' ? [e.a!, e.b!] : e.type === 'polyline' && e.pts?.length === 2 ? [e.pts[0], e.pts[1]] : null
	const lineLen = (e: Ent) => { const q = ends(e); return q ? Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]) : 0 }
	function setLineLen(v: number) {
		const e = single, q = e && ends(e), L = e ? lineLen(e) : 0; if (!e || !q || !(v > 0) || !L) return
		const b: Pt = [q[0][0] + ((q[1][0] - q[0][0]) * v) / L, q[0][1] + ((q[1][1] - q[0][1]) * v) / L]
		onupdate?.(e.type === 'dim' ? { ...e, b } : { ...e, pts: [q[0], b] })
	}
	function setRot(v: number) { const r = ((Math.round(v) % 360) + 360) % 360; setAll({ rot: r || undefined }) }

	// ── style (color / fill / weight / font / align) — applies to the whole selection ──
	const STROKE_TYPES = new Set(['polyline', 'arc', 'dim', 'rect', 'ellipse'])
	// a block insert's Fill feeds its 'byblock' filled shapes (an outlet: filled = low level, none = outline)
	const FILL_TYPES = new Set(['rect', 'ellipse', 'polyline', 'insert'])
	const anyText = $derived(ents.some((e) => e.type === 'text'))
	const anyStroke = $derived(ents.some((e) => STROKE_TYPES.has(e.type)))
	const anyFillable = $derived(ents.some((e) => FILL_TYPES.has(e.type)))
	// common value across the selection (undefined = mixed / unset)
	function cc<K extends keyof Ent>(k: K): Ent[K] | undefined { const v = new Set(ents.map((e) => e[k])); return v.size === 1 ? ents[0][k] : undefined }
	const mixedColor = $derived(new Set(ents.map((e) => e.color)).size > 1)
	const mixedFill = $derived(new Set(ents.map((e) => e.fill)).size > 1)
	function setAll(patch: Partial<Ent>) { onupdate?.(ents.map((e) => ({ ...e, ...patch }))) }
	const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
	let blockName = $state<string | null>(null)
	// D4: link a symbol to a sheet (its drawing number fills an empty SHEET) or to a URL
	function setLink(ins: Ent, v: string) {
		const attrs: Record<string, string> = { ...(ins.attrs ?? {}), LINK: v }
		const sh = sheets.find((s) => s.id === v)
		if (sh?.number && blockDef(ins.block)?.attributes.some((a) => a.tag === 'SHEET') && (!attrs.SHEET || attrs.SHEET === '—')) attrs.SHEET = sh.number
		onupdate?.({ ...ins, attrs })
	}
	// E5: several block inserts edited together — their shared category (null = mixed → no swap), the attributes
	// every one of them has (not LABEL / LINK), and a value common to all (undefined = mixed)
	const multiIns = $derived(ents.filter((e) => e.type === 'insert'))
	const multiCat = $derived.by(() => { const cs = new Set(multiIns.map((e) => blockDef(e.block)?.category ?? '')); return cs.size === 1 ? [...cs][0] : null })
	const multiTags = $derived.by(() => {
		const defs = multiIns.map((e) => blockDef(e.block)?.attributes ?? [])
		return (defs[0] ?? []).filter((a) => a.tag !== 'LABEL' && a.tag !== 'LINK' && defs.every((d) => d.some((x) => x.tag === a.tag)))
	})
	function multiCommon<T>(f: (e: Ent) => T): T | undefined { const vs = new Set(multiIns.map(f)); return vs.size === 1 ? [...vs][0] : undefined }
	/** Patch every selected insert (one undo step). */
	function setIns(patch: (e: Ent) => Partial<Ent>) { onupdate?.(multiIns.map((e) => ({ ...e, ...patch(e) }))) }
	// D6: auto-number the selection (texts, line labels, one attribute of the block inserts)
	let an = $state({ template: '#', start: 1, step: 1, order: 'rows' as NumberOrder, tag: '' })
	const anTags = $derived([...new Set(ents.filter((e) => e.type === 'insert').flatMap((e) => blockDef(e.block)?.attributes.map((a) => a.tag) ?? []))].filter((t) => t !== 'LINK'))
	const anCount = $derived(ents.filter((e) => numberable(e, an.tag || anTags[0])).length)
	function runAutoNumber() {
		// rows are "the same" within a third of the median shape height (at least 1 mm)
		const hs = ents.map((e) => { const b = bbox(e); return an.order === 'rows' ? b[3] - b[1] : b[2] - b[0] }).sort((a, b) => a - b)
		const tol = Math.max(1, (hs[hs.length >> 1] ?? 0) / 3)
		onupdate?.(autoNumber([...ents], { ...an, tag: an.tag || anTags[0], tol }))
	}
</script>

<div class="prop-sec">{ents.length === 1 ? 'OBJECT' : `${ents.length} OBJECTS`}</div>
<div class="prop"><span>Type</span><input value={typeLabel} readonly /></div>
<div class="prop-sec">POSITION</div>
<div class="vecrow">
	<NumCell k="X" v={r1(gb.x)} set={setX} />
	<NumCell k="Y" v={r1(gb.y)} set={setY} />
</div>
<div class="prop-sec">SIZE</div>
<div class="vecrow">
	{#if boxKind(single)}
		<NumCell k="W" v={r1(Math.abs(single!.b![0] - single!.a![0]))} set={setW} />
		<NumCell k="H" v={r1(Math.abs(single!.b![1] - single!.a![1]))} set={setH} />
	{:else}
		<NumCell k="W" v={r1(gb.w)} />
		<NumCell k="H" v={r1(gb.h)} />
	{/if}
</div>
<div class="prop-sec">ROTATION · degrees</div>
<div class="vecrow">
	<NumCell k="∠" v={Math.round((cc('rot') as number | undefined) ?? 0)} set={setRot} />
	<span class="vspacer"></span><span class="vspacer"></span>
</div>
<div class="prop-sec">ARRANGE</div>
<div class="prop"><span>Draw order</span>
	<span class="pp-seg">
		<!-- the same triangle each time: down = back, up = forward; a bar = all the way (to the back / front) -->
		<button title="Send to back (Ctrl+Shift+[)" onclick={() => onarrange?.('back')}>{@render arrow(true, true)}</button>
		<button title="Send backward (Ctrl+[)" onclick={() => onarrange?.('backward')}>{@render arrow(true, false)}</button>
		<button title="Bring forward (Ctrl+])" onclick={() => onarrange?.('forward')}>{@render arrow(false, false)}</button>
		<button title="Bring to front (Ctrl+Shift+])" onclick={() => onarrange?.('front')}>{@render arrow(false, true)}</button>
	</span>
</div>
{#if single?.type === 'text'}
	<div class="prop-sec">TEXT</div>
	<div class="prop wide"><textarea class="pp-textarea" use:autoresize value={single.text ?? ''} onchange={(e) => setText((e.currentTarget as HTMLTextAreaElement).value)}></textarea></div>
	<label class="prop cb"><span>Callout</span><input type="checkbox" checked={!!single.callout} onchange={(e) => setCallout((e.currentTarget as HTMLInputElement).checked)} /></label>
	{#if single.callout}
		<div class="prop"><span>Frame</span>
			<select value={single.calloutBorder ?? 'box'} onchange={(e) => setAll({ calloutBorder: (e.currentTarget as HTMLSelectElement).value as 'box' | 'underline' | 'none' })}>
				<option value="box">Box</option><option value="underline">Underline</option><option value="none">None</option>
			</select></div>
	{/if}
{/if}
{#if single?.type === 'polyline'}
	<!-- D7: a text label drawn along the line -->
	<div class="prop-sec">LABEL</div>
	<div class="prop"><span>Text</span><input value={single.text ?? ''} placeholder="(none)" onchange={(e) => setAll({ text: strVal(e).trim() || undefined })} onkeydown={blurOnEnter} /></div>
	{#if single.text}
		<div class="prop"><span>At</span>
			<span class="pp-seg">
				{#each [['start', 'Start'], ['mid', 'Middle'], ['end', 'End']] as const as [v, l] (v)}
					<button class:on={(single.textPos ?? 'mid') === v} onclick={() => setAll({ textPos: v === 'mid' ? undefined : v })}>{l}</button>
				{/each}
			</span></div>
	{/if}
{/if}
{#if single?.type === 'rect'}
	<div class="prop-sec">RECT</div>
	<label class="prop cb"><span>Revision cloud</span><input type="checkbox" checked={!!single.cloud} onchange={(e) => setAll({ cloud: (e.currentTarget as HTMLInputElement).checked })} /></label>
	<!-- D2: a floor-tile grid inside the rect, aligned to the model origin (+ an offset) -->
	<div class="prop"><span>Tile grid</span><input type="number" min="0" step="50" value={single.tile ?? 0} placeholder="off" title="Tile size (mm); 0 = no grid" onchange={(e) => setAll({ tile: num(e) > 0 ? num(e) : undefined })} /></div>
	{#if single.tile}
		<div class="vecrow">
			<NumCell k="dX" v={single.tileOff?.[0] ?? 0} set={(n) => setAll({ tileOff: [n, single!.tileOff?.[1] ?? 0] })} />
			<NumCell k="dY" v={single.tileOff?.[1] ?? 0} set={(n) => setAll({ tileOff: [single!.tileOff?.[0] ?? 0, n] })} />
		</div>
	{/if}
{/if}
{#if (single?.type === 'polyline' && (single.pts?.length ?? 0) === 2) || single?.type === 'dim'}
	<!-- XP33: a head per end (arrow / dot / tick / none) — a 2-point line defaults to none, a dimension
	     to arrow. (R4: a straight 2-point polyline is the retired 'line' type's replacement.) -->
	{@const dflt = single.type === 'dim' ? 'arrow' : 'none'}
	<div class="prop-sec">{single.type === 'dim' ? 'DIMENSION' : 'LINE'}</div>
	<!-- D8: type a length — the end point moves along the line, the angle stays -->
	<div class="prop"><span>Length</span><input class="navf" type="number" min="1" value={Math.round(lineLen(single))} onkeydown={fnav} onchange={(e) => setLineLen(num(e))} /></div>
	{#if single.type === 'dim'}
		<div class="prop"><span>Unit</span>
			<select value={single.unit ?? 'mm'} onchange={(e) => setAll({ unit: strVal(e) === 'mm' ? undefined : (strVal(e) as 'cm' | 'm') })}>
				<option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option>
			</select></div>
	{/if}
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
		{#if ad.tag === 'LINK'}
			<!-- D4: what the symbol points at — a sheet (its number fills SHEET), or a URL; Open / double-click goes there -->
			{@const cur = ins.attrs?.LINK ?? ''}
			<div class="prop"><span>{ad.label}</span>
				<span class="pp-scale">
					<select value={sheets.some((s) => s.id === cur) ? cur : cur ? '~url' : ''} onchange={(e) => setLink(ins, (e.currentTarget as HTMLSelectElement).value)}>
						<option value="">(nothing)</option>
						{#each sheets as s (s.id)}<option value={s.id}>{s.number ? `${s.number} · ` : ''}{s.title}</option>{/each}
						<option value="~url">A web address…</option>
					</select>
					{#if cur}<button class="pp-mini" title="Open what it links to" onclick={() => onopenlink?.(cur)}>Open</button>{/if}
				</span></div>
			{#if cur && !sheets.some((s) => s.id === cur)}
				<div class="prop"><span></span><input value={cur === '~url' ? '' : cur} placeholder="https://…" onchange={(e) => onupdate?.({ ...ins, attrs: { ...(ins.attrs ?? {}), LINK: strVal(e).trim() } })} onkeydown={blurOnEnter} /></div>
			{/if}
		{:else}
			<div class="prop"><span>{ad.label}</span><input value={ins.attrs?.[ad.tag] ?? ad.default ?? ''}
				onchange={(e) => onupdate?.({ ...ins, attrs: { ...(ins.attrs ?? {}), [ad.tag]: strVal(e) } })} onkeydown={blurOnEnter} /></div>
		{/if}
	{/each}
	{#if onwalk && isOutletEnt(ins)}
		<!-- E3: click the other outlets in order; each takes the next label after this one -->
		{@const nx = incLabel(ins.attrs?.LABEL ?? '')}
		<button class="pp-reset" disabled={!nx} title={nx ? `The next one clicked becomes ${nx}` : 'Give this outlet a label ending in a number first'}
			onclick={() => onwalk(ins.attrs?.LABEL ?? '')}>Renumber by clicking from here…</button>
	{/if}
	<!-- a block's size: × its drawn size (a 900 door at 0.8 = 720); an annotative block is sized on paper instead -->
	<div class="prop"><span>Scale</span><input class="navf" type="number" min="0.05" step="0.05" value={ins.scale ?? 1} title="Size × the block's own size"
		onkeydown={fnav} onchange={(e) => { const s = Math.round(num(e) * 1000) / 1000; if (s > 0) onupdate?.({ ...ins, scale: s === 1 ? undefined : s }) }} /></div>
	<label class="prop cb"><span>Mirror</span><input type="checkbox" checked={!!ins.mirror} title="Flip left ↔ right (e.g. a door's hinge side)" onchange={(e) => onupdate?.({ ...ins, mirror: (e.currentTarget as HTMLInputElement).checked || undefined })} /></label>
{/if}
{#if !single && multiIns.length > 1}
	<!-- E5: several block inserts (outlets) edited together — a field they share shows its value, or "— mixed —"
	     when they differ; a change sets it on all of them. LABEL stays per-outlet (Auto-number / walk renumber). -->
	{@const sc = multiCommon((e) => e.scale ?? 1)}
	{@const mir = multiCommon((e) => !!e.mirror)}
	<div class="prop-sec">BLOCKS · {multiIns.length}</div>
	{#if multiCat !== null}
		<div class="prop"><span>Block</span>
			<select value={multiCommon((e) => e.block) ?? ''} onchange={(e) => { const b = strVal(e); if (b) setIns(() => ({ block: b })) }}>
				{#if multiCommon((e) => e.block) === undefined}<option value="" disabled>— mixed —</option>{/if}
				{#each blockList().filter((b) => !multiCat || b.category === multiCat) as b (b.id)}<option value={b.id}>{b.name}</option>{/each}
			</select></div>
	{/if}
	{#each multiTags as ad (ad.tag)}
		{@const v = multiCommon((e) => e.attrs?.[ad.tag] ?? ad.default ?? '')}
		<div class="prop"><span>{ad.label}</span><input value={v ?? ''} placeholder={v === undefined ? '— mixed —' : ''}
			onchange={(e) => { const s = strVal(e); setIns((x) => ({ attrs: { ...(x.attrs ?? {}), [ad.tag]: s } })) }} onkeydown={blurOnEnter} /></div>
	{/each}
	<div class="prop"><span>Scale</span><input class="navf" type="number" min="0.05" step="0.05" value={sc ?? ''} placeholder={sc === undefined ? '— mixed —' : ''} title="Size × the block's own size"
		onkeydown={fnav} onchange={(e) => { const s = Math.round(num(e) * 1000) / 1000; if (s > 0) setIns(() => ({ scale: s === 1 ? undefined : s })) }} /></div>
	<label class="prop cb"><span>Mirror</span><input type="checkbox" checked={!!mir} indeterminate={mir === undefined} title="Flip left ↔ right"
		onchange={(e) => { const on = (e.currentTarget as HTMLInputElement).checked; setIns(() => ({ mirror: on || undefined })) }} /></label>
{/if}
{#if single?.type === 'image'}
	<!-- imported file: origin = Position, scale = Size (above); here opacity (for tracing), greyscale + CROP
	     (visible sub-rect of the source, as %). Real backend stores these against the fileId (§4). -->
	{@const cr = single.crop ?? { x: 0, y: 0, w: 1, h: 1 }}
	<div class="prop-sec">IMAGE</div>
	<div class="prop"><span>Opacity %</span><input class="navf" type="number" min="10" max="100" step="5" value={Math.round((single.opacity ?? 1) * 100)} onkeydown={fnav} onchange={(e) => setAll({ opacity: Math.max(0.05, Math.min(1, num(e) / 100)) })} /></div>
	{#if single.src?.startsWith('pdf:')}
		<!-- I6: a floorplan page can follow its Uploads calibration live; moving / scaling / cropping it here unlinks it -->
		<div class="prop"><span>Calibration</span>
			<span class="pp-seg">
				<button class:on={!!single.live} title="Follow the Uploads tool's origin / scale / crop for this page" onclick={() => setAll({ live: true })}>Uploads (live)</button>
				<button class:on={!single.live} title="Placed here in Pages (edits in Uploads don't move it)" onclick={() => setAll({ live: undefined })}>Fixed</button>
			</span></div>
	{/if}
	<label class="prop cb"><span>Greyscale</span><input type="checkbox" checked={!!single.grey} onchange={(e) => setAll({ grey: (e.currentTarget as HTMLInputElement).checked || undefined })} /></label>
	<!-- calibration modes (Uploads-tool model): each toggles a Viewport interaction on the image. -->
	<div class="prop"><span>Calibrate</span>
		<span class="pp-seg">
			<button class:on={imgEdit.mode === 'origin' && imgEdit.id === single.id} title="Click a reference point inside the image" onclick={() => setImgMode('origin', single!.id)}>Origin</button>
			<button class:on={imgEdit.mode === 'scale' && imgEdit.id === single.id} title="Draw a line across a known distance, then enter it" onclick={() => setImgMode('scale', single!.id)}>Scale</button>
			<button class:on={imgEdit.mode === 'crop' && imgEdit.id === single.id} title="Drag the corner handles to crop" onclick={() => setImgMode('crop', single!.id)}>Crop</button>
		</span>
	</div>
	<div class="prop-sec">CROP · %</div>
	<div class="vecrow">
		<NumCell k="X" v={Math.round(cr.x * 100)} set={(n) => setAll({ crop: { ...cr, x: clamp01(n / 100) } })} />
		<NumCell k="Y" v={Math.round(cr.y * 100)} set={(n) => setAll({ crop: { ...cr, y: clamp01(n / 100) } })} />
	</div>
	<div class="vecrow">
		<NumCell k="W" v={Math.round(cr.w * 100)} set={(n) => setAll({ crop: { ...cr, w: Math.max(0.05, clamp01(n / 100)) } })} />
		<NumCell k="H" v={Math.round(cr.h * 100)} set={(n) => setAll({ crop: { ...cr, h: Math.max(0.05, clamp01(n / 100)) } })} />
	</div>
	<button class="pp-reset" onclick={() => setAll({ crop: undefined })}>Reset crop</button>
{/if}
<div class="prop-sec">STYLE</div>
<!-- R5: entities pick from the model's one layer list, the same list as model objects -->
<div class="prop"><span>Layer</span>
	<select class="navf" value={(cc('layer') as string | undefined) ?? ''} onkeydown={fnav} onchange={(e) => setAll({ layer: strVal(e) || undefined })}>
		<option value="">— none —</option>
		{#each layers as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
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
{#if ents.length > 1 && anCount}
	<!-- D6: number the selection in reading order — `#` run = the zero-padded number -->
	<div class="prop-sec">AUTO-NUMBER</div>
	<div class="prop"><span>Template</span><input value={an.template} placeholder="e.g. R-###" title="The run of # is the number, zero-padded to its length" oninput={(e) => (an.template = strVal(e))} onkeydown={blurOnEnter} /></div>
	<div class="vecrow">
		<NumCell k="From" v={an.start} set={(n) => (an.start = Math.round(n))} />
		<NumCell k="Step" v={an.step} set={(n) => (an.step = Math.round(n) || 1)} />
	</div>
	{#if anTags.length}
		<div class="prop"><span>Attribute</span>
			<select value={an.tag || anTags[0]} onchange={(e) => (an.tag = strVal(e))}>
				{#each anTags as t (t)}<option value={t}>{t}</option>{/each}
			</select></div>
	{/if}
	<div class="prop"><span>Order</span>
		<span class="pp-seg">
			<button class:on={an.order === 'rows'} title="Across each row, then down" onclick={() => (an.order = 'rows')}>Rows</button>
			<button class:on={an.order === 'cols'} title="Down each column, then across" onclick={() => (an.order = 'cols')}>Columns</button>
		</span></div>
	<button class="pp-reset" onclick={runAutoNumber}>Number {anCount} shapes</button>
{/if}
{#if onsaveblock}
	<!-- D5: the selection → a block in the global library (placed from the Blocks panel) -->
	{#if blockName === null}
		<button class="pp-reset" onclick={() => (blockName = '')}>Save as block…</button>
	{:else}
		<div class="prop"><span>Block name</span><span class="pp-scale"><input value={blockName} placeholder="e.g. Desk pod" oninput={(e) => (blockName = strVal(e))}
			onkeydown={(e) => { if (e.key === 'Enter' && blockName?.trim()) { onsaveblock(blockName.trim()); blockName = null } if (e.key === 'Escape') blockName = null }} />
			<button class="pp-mini" disabled={!blockName.trim()} onclick={() => { onsaveblock(blockName!.trim()); blockName = null }}>Save</button></span></div>
	{/if}
{/if}
<div class="pp-hint">{ents.length > 1 ? 'Style + position apply to the whole selection.' : 'Editing writes straight to the object.'} New objects use Sheets’ defaults ({STYLE_DEFAULTS.fontPt}pt, left).</div>

{#snippet arrow(down: boolean, bar: boolean)}
	<!-- a draw-order icon: a triangle (down = backward, up = forward) + a bar on the far side for "all the way" -->
	<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true" style="display:block; margin:auto">
		{#if down}<polygon points="1.5,3.5 10.5,3.5 6,9" />{#if bar}<rect x="1.5" y="10" width="9" height="1.6" />{/if}
		{:else}<polygon points="1.5,8.5 10.5,8.5 6,3" />{#if bar}<rect x="1.5" y="0.4" width="9" height="1.6" />{/if}{/if}
	</svg>
{/snippet}
