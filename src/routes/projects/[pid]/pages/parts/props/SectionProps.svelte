<script lang="ts">
	// Properties › a SECTION marker (selected on the plan). A LINE section (elevation-section-plan.md phase 3): its name
	// (the "A" of A–A′), depth, which way it looks (flip), its z band (unset = every height), its length / angle; a BOX:
	// its name + primary sight direction; an ELEVATION MARKER (phase 4): its own number (the callout's while no viewport
	// shows it), an optional title, the way it looks (angle — the command line's CAD sense, CCW from +X; the four axes;
	// turn round), the band it sees (width × depth), its z band. All: the sheet viewports it drives (Dave: usually several
	// — each opens its sheet with the frame selected), drop another one, delete (the page asks first while any are linked).
	import NumCell from './NumCell.svelte'
	import { blurOnEnter, strVal } from './fields'
	import { isLineSection, sectionTitle, type SectionLink } from '../../ui/sectionLine'
	import { isElevMarker, planToUserAngle, userToPlanAngle } from '../../ui/elevMarker'
	import type { Section, Layer } from '../../3dview/types'
	import { SECTIONS_LAYER, sectionLayer } from '../../3dview/migrate'
	import type { ElevDir } from '../../ui/geometry'

	let { sec, links = [], layers = [], onupdate, ondrop, ondelete, onopen }: {
		sec: Section; links?: SectionLink[]
		/** The model's layers (the marker's Layer picker). */
		layers?: Layer[]
		/** A field changed: its patch (a key set to undefined is removed), one undo step. */
		onupdate?: (patch: Record<string, unknown>, label?: string) => void
		/** Drop its view as another linked viewport on the current sheet (a box: its primary direction). */
		ondrop?: () => void; ondelete?: () => void; onopen?: (l: SectionLink) => void
	} = $props()

	const line = $derived(isLineSection(sec) ? sec : null)
	const em = $derived(isElevMarker(sec) ? sec : null)
	const len = $derived(line ? Math.round(Math.hypot(line.b[0] - line.a[0], line.b[1] - line.a[1])) : 0)
	// the cut line's plan bearing in user terms (Y up, CCW from +X), like the command line's d<angle
	const ang = $derived(line ? Math.round(((Math.atan2(-(line.b[1] - line.a[1]), line.b[0] - line.a[0]) * 180) / Math.PI + 360) % 360 * 10) / 10 : 0)
	// a marker's look in the same user terms (it stores plan degrees on the drawing — ui/elevMarker.ts)
	const look = $derived(em ? Math.round(planToUserAngle(em.angle) * 10) / 10 : 0)
	const DIRS: [ElevDir, string][] = [['front', 'Front'], ['rear', 'Rear'], ['left', 'Left'], ['right', 'Right']]
	// the four axes, as PLAN angles (0 = → … 270 = ↑): ↑ looks up the sheet = the front elevation
	const AXES: [number, string, string][] = [[270, '↑', 'Up the sheet (front)'], [0, '→', 'Right (east)'], [90, '↓', 'Down the sheet (rear)'], [180, '←', 'Left (west)']]
</script>

{#snippet heights(z0: number | undefined, z1: number | undefined)}
	<div class="prop-sec">HEIGHTS · mm<span class="sec-hint">{z0 == null && z1 == null ? 'every height' : 'only this band'}</span>
		{#if z0 != null || z1 != null}<button class="pp-mini sec-btn" onclick={() => onupdate?.({ z0: undefined, z1: undefined }, 'Section heights')}>All</button>{/if}</div>
	<div class="vecrow">
		<NumCell k="Z↓" v={z0 ?? 0} set={(n) => onupdate?.({ z0: Math.round(n), z1: Math.max(Math.round(n) + 1, z1 ?? 3200) }, 'Section heights')} />
		<NumCell k="Z↑" v={z1 ?? 0} set={(n) => onupdate?.({ z0: Math.min(z0 ?? 0, Math.round(n) - 1), z1: Math.round(n) }, 'Section heights')} />
	</div>
{/snippet}

<div class="prop-sec">{em ? 'ELEVATION MARKER' : 'SECTION'}<span class="sec-hint">{sectionTitle(sec)}</span></div>
<!-- its LAYER (default "Sections"): hide / freeze / lock the markers with it — their viewports keep working -->
<div class="prop"><span>Layer</span>
	<select value={sectionLayer(sec)} title="The marker's layer — hide it there to hide the marker on the plan (its viewports still show the view)"
		onchange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; onupdate?.({ layer: v === SECTIONS_LAYER.id ? undefined : v }, 'Section layer') }}>
		{#if !layers.some((l) => l.id === SECTIONS_LAYER.id)}<option value={SECTIONS_LAYER.id}>{SECTIONS_LAYER.name}</option>{/if}
		{#each layers.filter((l) => l.group !== 'Background') as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
	</select>
</div>
{#if em}
	<div class="prop"><span>Number</span><input value={em.number ?? ''} placeholder="1"
		title="Its callout number while no viewport shows it (linked, it shows the first viewport’s number / sheet)"
		onchange={(e) => onupdate?.({ number: strVal(e).trim() || undefined }, 'Renumber elevation marker')} onkeydown={blurOnEnter} /></div>
	<div class="prop"><span>Title</span><input value={em.name ?? ''} placeholder="Elevation {em.number ?? '?'}"
		title="Optional — its viewports’ ground line reads it (else “ELEVATION {em.number ?? '?'}”)"
		onchange={(e) => onupdate?.({ name: strVal(e).trim() || undefined }, 'Rename elevation marker')} onkeydown={blurOnEnter} /></div>
	<div class="prop"><span>Looks</span>
		<span class="pp-seg">
			{#each AXES as [a, g, t] (a)}<button class:on={em.angle === a} title={t} onclick={() => { if (em.angle !== a) onupdate?.({ angle: a }, 'Turn elevation marker') }}>{g}</button>{/each}
		</span></div>
	<div class="vecrow">
		<NumCell k="∠" v={look} set={(n) => onupdate?.({ angle: userToPlanAngle(n) }, 'Turn elevation marker')} />
		<button class="pp-mini" title="Look the other way" onclick={() => onupdate?.({ angle: (em.angle + 180) % 360 }, 'Turn elevation marker')}>Turn round</button>
	</div>
	<div class="vecrow">
		<NumCell k="Width" v={em.width} set={(n) => { if (n > 0) onupdate?.({ width: Math.round(n) }, 'Elevation width') }} />
		<NumCell k="Depth" v={em.depth} set={(n) => { if (n > 0) onupdate?.({ depth: Math.round(n) }, 'Elevation depth') }} />
	</div>
	<div class="vecrow"><div class="pp-ro">At {Math.round(em.at[0])}, {Math.round(-em.at[1])}</div><div class="pp-ro" title="CCW from +X, Y up — like the command line">Angle {look}°</div></div>
	{@render heights(em.z0, em.z1)}
{:else}
	<div class="prop"><span>Name</span><input value={sec.name ?? ''} placeholder={line ? 'A' : 'Section A'}
		title={line ? 'The letter at the ends: A … A′' : 'Its label on the plan'}
		onchange={(e) => onupdate?.({ name: strVal(e).trim() || undefined }, 'Rename section')} onkeydown={blurOnEnter} /></div>
	{#if line}
		<div class="prop"><span>Looks</span>
			<span class="pp-seg">
				<button class:on={!line.flip} title="To the left of A → A′ as drawn" onclick={() => { if (line.flip) onupdate?.({ flip: undefined }, 'Flip section') }}>Left</button>
				<button class:on={!!line.flip} title="To the right of A → A′" onclick={() => { if (!line.flip) onupdate?.({ flip: true }, 'Flip section') }}>Right</button>
			</span></div>
		<div class="vecrow">
			<NumCell k="Depth" v={line.depth} set={(n) => { if (n > 0) onupdate?.({ depth: Math.round(n) }, 'Section depth') }} />
			<NumCell k="Len" v={len} />
		</div>
		<div class="vecrow"><div class="pp-ro">Angle {ang}°</div><div class="pp-ro">A {Math.round(line.a[0])}, {Math.round(-line.a[1])}</div></div>
		{@render heights(line.z0, line.z1)}
	{:else if sec.kind !== 'line' && sec.kind !== 'elev'}
		<div class="prop"><span>Looks</span>
			<select value={sec.dir} onchange={(e) => onupdate?.({ dir: (e.currentTarget as HTMLSelectElement).value }, 'Set section direction')}>
				{#each DIRS as [d, l] (d)}<option value={d}>{l}</option>{/each}
			</select></div>
	{/if}
{/if}
<div class="prop-sec">VIEWPORTS<span class="sec-hint">{links.length ? `${links.length} linked — they follow it live` : 'none yet'}</span>
	<button class="pp-mini sec-btn" title="Drop its view on the current sheet — again for another linked viewport" onclick={() => ondrop?.()}>+ Drop</button></div>
{#if links.length}
	<div class="sp-links">
		{#each links as l (l.did + l.frameId)}<button title="Open the sheet with this viewport selected" onclick={() => onopen?.(l)}>{l.sheet} · {l.frame}</button>{/each}
	</div>
{/if}
<button class="pp-del" onclick={() => ondelete?.()}>{em ? 'Delete elevation marker' : 'Delete section'}</button>
<div class="pp-hint">{em ? 'Drag the marker to move it, its arrow tip to turn it (Shift = 15°), the band ends / the diamond for width / depth. The callout shows its first viewport’s number / sheet. Each viewport keeps its own notes, freezes and scale.'
	: line ? 'Drag its ends / the depth handle on the plan; click an end arrow to flip. Each viewport keeps its own notes, freezes and scale.' : 'Drag the box / its corners on the plan; its arrows drop the elevations.'}</div>

<style>
	.sp-links { display:flex; flex-wrap:wrap; gap:4px; padding:2px 0 6px; }
	.sp-links button { font-size:11px; color:var(--accent); background:none; border:1px solid var(--line-soft); border-radius:4px; padding:1px 6px; cursor:pointer; }
	.sp-links button:hover { background:var(--hover, #0e74901a); }
</style>
