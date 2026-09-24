<script lang="ts">
	// Properties › a sheet VIEWPORT FRAME: its label, source model, view (projection / scale / border), a riser
	// drawing's visible floors, and its paper geometry (in paper mm; stored as paper px) + lock.
	import NumCell from './NumCell.svelte'
	import { blurOnEnter, strVal } from './fields'
	import { PAPER_PX_PER_MM } from '../../constants'
	import { type SheetFrame, type Proj, PROJ_OPTS, SCALES } from '../../types'

	let { frame, modelList = [], storeys = [], conduits = [], onupdate, ondelete, onfit }: {
		frame: SheetFrame; modelList?: { id: string; name: string }[]
		/** F12: the frame's model's conduits — a frame can show one's cross-section (fill) instead of a view. */
		conduits?: { id: string; name: string }[]
		/** The frame's model storeys (a building) — its FLOORS checklist in an elevation. */
		storeys?: { id: string; name: string; z?: number }[]
		onupdate?: (patch: Partial<SheetFrame>) => void; ondelete?: () => void
		/** XP19: fit the frame's scale to its model */ onfit?: () => void
	} = $props()

	// XP26: frames are stored in paper px; the panel shows / takes paper mm (1 decimal).
	const mmOf = (px: number) => Math.round((px / PAPER_PX_PER_MM) * 10) / 10
	const pxOf = (mm: number) => Math.round(mm * PAPER_PX_PER_MM)
	const MIN_FRAME_PX = 60   // ≈ 26 mm — PaperPage's own minimum
	// XP19: "1:137", "1 : 137" or "137" → 137 (a positive whole number), else null.
	const parseScale = (v: string): number | null => { const m = /^\s*(?:1\s*:\s*)?(\d+)\s*$/.exec(v); const n = m ? Number(m[1]) : NaN; return n >= 1 ? n : null }
	const seqLabel = $derived(frame.seq != null ? String(frame.seq) : '')
</script>

<div class="prop-sec">VIEWPORT</div>
<!-- the frame's printed tag (its number by default — type e.g. "A" or "1 · Plan" to override) -->
<div class="prop"><span>Label</span><input value={frame.label} placeholder={seqLabel} title="Printed above the viewport; empty = its number"
	onchange={(e) => onupdate?.({ label: strVal(e).trim() || seqLabel })} onkeydown={blurOnEnter} /></div>
{#if modelList.length > 1}
	<div class="prop"><span>Source</span>
		<select value={frame.modelId ?? modelList[0]?.id} onchange={(e) => onupdate?.({ modelId: (e.currentTarget as HTMLSelectElement).value })}>
			{#each modelList as m (m.id)}<option value={m.id}>{m.name}</option>{/each}
		</select>
	</div>
{/if}
{#if conduits.length || frame.fillOf}
	<div class="prop"><span>Shows</span>
		<select value={frame.fillOf ?? ''} onchange={(e) => onupdate?.({ fillOf: (e.currentTarget as HTMLSelectElement).value || undefined })}>
			<option value="">The model view</option>
			{#each conduits as c (c.id)}<option value={c.id}>Fill · {c.name}</option>{/each}
			{#if frame.fillOf && !conduits.some((c) => c.id === frame.fillOf)}<option value={frame.fillOf}>Fill · (missing conduit)</option>{/if}
		</select>
	</div>
{/if}
<div class="prop"><span>View</span>
	<!-- a numbered frame keeps its label; an unnumbered one is named after its view -->
	<select value={frame.proj} onchange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value as Proj; onupdate?.(frame.seq != null ? { proj: v } : { proj: v, label: PROJ_OPTS.find(([pv]) => pv === v)?.[1] }) }}>
		{#each PROJ_OPTS as [v, l] (v)}<option value={v}>{l}</option>{/each}
	</select>
</div>
<!-- XP19: any 1:N (type "1:137" or "137"; the list offers the standard ones) + Fit to the model -->
<div class="prop"><span>Scale</span>
	<span class="pp-scale">
		<input list="pp-scales" value={frame.scale} title="Any scale — 1:N or just N"
			onchange={(e) => { const n = parseScale(strVal(e)); if (n) onupdate?.({ scale: `1:${n}` }); else (e.currentTarget as HTMLInputElement).value = frame.scale }} />
		<button class="pp-mini" title="Fit: the scale that shows the whole model, centred" onclick={() => onfit?.()}>Fit</button>
	</span>
	<datalist id="pp-scales">{#each SCALES as s (s)}<option value={s}></option>{/each}</datalist>
</div>
<div class="prop"><span>Border</span>
	<select value={frame.border} onchange={(e) => onupdate?.({ border: (e.currentTarget as HTMLSelectElement).value as 'dashed' | 'solid' | 'none' })}>
		<option value="solid">Solid</option><option value="dashed">Dashed</option><option value="none">None</option>
	</select>
</div>
<!-- I2: hidden-line removal (plan / elevations) + black-and-white; I1: a plan's cut band (one floor, slab to slab) -->
{#if frame.proj !== 'iso'}
	<div class="prop"><span>Hidden lines</span>
		<span class="pp-seg">
			<button class:on={!frame.hideHidden} title="Every edge, as a wireframe" onclick={() => onupdate?.({ hideHidden: undefined })}>Show</button>
			<button class:on={!!frame.hideHidden} title="Nearer faces hide what's behind them" onclick={() => onupdate?.({ hideHidden: true })}>Hide</button>
		</span></div>
{/if}
<div class="prop"><span>Colour</span>
	<span class="pp-seg">
		<button class:on={!frame.mono} onclick={() => onupdate?.({ mono: undefined })}>Colour</button>
		<button class:on={!!frame.mono} title="Everything in black — for monochrome prints" onclick={() => onupdate?.({ mono: true })}>B/W</button>
	</span></div>
{#if frame.proj === 'plan'}
	{@const lv = [...storeys].filter((s) => s.z != null).sort((a, b) => a.z! - b.z!)}
	<div class="prop-sec">PLAN CUT · mm<span class="sec-hint">{frame.zBand ? 'objects in this height band' : 'all heights'}</span>
		{#if frame.zBand}<button class="pp-mini sec-btn" onclick={() => onupdate?.({ zBand: undefined })}>All</button>{/if}</div>
	<div class="vecrow">
		<NumCell k="Z↓" v={frame.zBand?.z0 ?? 0} set={(n) => onupdate?.({ zBand: { z0: Math.round(n), z1: Math.max(Math.round(n) + 1, frame.zBand?.z1 ?? 3000) } })} />
		<NumCell k="Z↑" v={frame.zBand?.z1 ?? 0} set={(n) => onupdate?.({ zBand: { z0: Math.min(frame.zBand?.z0 ?? 0, Math.round(n) - 1), z1: Math.round(n) } })} />
	</div>
	{#if lv.length}
		<!-- fit to a floor: from its datum up to the next floor's -->
		<div class="prop"><span>Fit to floor</span>
			<select value="" onchange={(e) => { const i = lv.findIndex((s) => s.id === strVal(e)); if (i >= 0) onupdate?.({ zBand: { z0: lv[i].z!, z1: lv[i + 1]?.z ?? lv[i].z! + 4000 } }); (e.currentTarget as HTMLSelectElement).value = '' }}>
				<option value="">Pick a floor…</option>
				{#each [...lv].reverse() as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
			</select></div>
	{/if}
{/if}
<!-- a riser drawing: which floors this building elevation shows (the rest collapse to a break) -->
{#if storeys.length && frame.proj !== 'plan' && frame.proj !== 'iso'}
	{@const shown = new Set(frame.storeys ?? storeys.map((s) => s.id))}
	<div class="prop-sec">FLOORS<span class="sec-hint">hidden floors collapse to a break</span>
		<button class="pp-mini sec-btn" onclick={() => onupdate?.({ storeys: undefined })}>All</button></div>
	<div class="pp-floors">
		{#each [...storeys].reverse() as s (s.id)}
			<label><input type="checkbox" checked={shown.has(s.id)} onchange={(e) => {
				const on = (e.currentTarget as HTMLInputElement).checked, next = storeys.map((x) => x.id).filter((id) => (id === s.id ? on : shown.has(id)))
				onupdate?.({ storeys: next.length === storeys.length ? undefined : next })
			}} />{s.name}</label>
		{/each}
	</div>
{/if}
<!-- XP26: frame position / size in PAPER MM (stored as paper px); XP22: a locked frame can't move -->
<div class="prop-sec">FRAME · mm</div>
<label class="prop cb"><span>Lock</span><input type="checkbox" checked={!!frame.locked} onchange={(e) => onupdate?.({ locked: (e.currentTarget as HTMLInputElement).checked || undefined })} /></label>
{#if frame.locked}
	<div class="vecrow"><div class="pp-ro">X {mmOf(frame.x)}</div><div class="pp-ro">Y {mmOf(frame.y)}</div></div>
	<div class="vecrow"><div class="pp-ro">W {mmOf(frame.w)}</div><div class="pp-ro">H {mmOf(frame.h)}</div></div>
{:else}
	<div class="vecrow">
		<NumCell k="X" v={mmOf(frame.x)} set={(n) => onupdate?.({ x: pxOf(n) })} />
		<NumCell k="Y" v={mmOf(frame.y)} set={(n) => onupdate?.({ y: pxOf(n) })} />
	</div>
	<div class="vecrow">
		<NumCell k="W" v={mmOf(frame.w)} set={(n) => onupdate?.({ w: Math.max(MIN_FRAME_PX, pxOf(n)) })} />
		<NumCell k="H" v={mmOf(frame.h)} set={(n) => onupdate?.({ h: Math.max(MIN_FRAME_PX, pxOf(n)) })} />
	</div>
{/if}
<button class="pp-del" onclick={() => ondelete?.()}>Delete viewport</button>
<div class="pp-hint">A viewport is a window onto the model. Double-click it to edit inside; change the view or scale here.</div>
