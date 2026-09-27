<script lang="ts">
	// Properties › a SECTION marker (selected on the plan). A LINE section (elevation-section-plan.md phase 3): its name
	// (the "A" of A–A′), depth, which way it looks (flip), its z band (unset = every height), its length / angle; a BOX:
	// its name + primary sight direction. Both: the sheet viewports it drives (Dave: usually several — each opens its
	// sheet with the frame selected), drop another one, delete (the page asks first while any are linked).
	import NumCell from './NumCell.svelte'
	import { blurOnEnter, strVal } from './fields'
	import { isLineSection, sectionTitle, type SectionLink } from '../../ui/sectionLine'
	import type { Section } from '../../3dview/types'
	import type { ElevDir } from '../../ui/geometry'

	let { sec, links = [], onupdate, ondrop, ondelete, onopen }: {
		sec: Section; links?: SectionLink[]
		/** A field changed: its patch (a key set to undefined is removed), one undo step. */
		onupdate?: (patch: Record<string, unknown>, label?: string) => void
		/** Drop its view as another linked viewport on the current sheet (a box: its primary direction). */
		ondrop?: () => void; ondelete?: () => void; onopen?: (l: SectionLink) => void
	} = $props()

	const line = $derived(isLineSection(sec) ? sec : null)
	const len = $derived(line ? Math.round(Math.hypot(line.b[0] - line.a[0], line.b[1] - line.a[1])) : 0)
	// the cut line's plan bearing in user terms (Y up, CCW from +X), like the command line's d<angle
	const ang = $derived(line ? Math.round(((Math.atan2(-(line.b[1] - line.a[1]), line.b[0] - line.a[0]) * 180) / Math.PI + 360) % 360 * 10) / 10 : 0)
	const DIRS: [ElevDir, string][] = [['front', 'Front'], ['rear', 'Rear'], ['left', 'Left'], ['right', 'Right']]
</script>

<div class="prop-sec">SECTION<span class="sec-hint">{sectionTitle(sec)}</span></div>
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
	<div class="prop-sec">HEIGHTS · mm<span class="sec-hint">{line.z0 == null && line.z1 == null ? 'every height' : 'only this band'}</span>
		{#if line.z0 != null || line.z1 != null}<button class="pp-mini sec-btn" onclick={() => onupdate?.({ z0: undefined, z1: undefined }, 'Section heights')}>All</button>{/if}</div>
	<div class="vecrow">
		<NumCell k="Z↓" v={line.z0 ?? 0} set={(n) => onupdate?.({ z0: Math.round(n), z1: Math.max(Math.round(n) + 1, line.z1 ?? 3200) }, 'Section heights')} />
		<NumCell k="Z↑" v={line.z1 ?? 0} set={(n) => onupdate?.({ z0: Math.min(line.z0 ?? 0, Math.round(n) - 1), z1: Math.round(n) }, 'Section heights')} />
	</div>
{:else if sec.kind !== 'line'}
	<div class="prop"><span>Looks</span>
		<select value={sec.dir} onchange={(e) => onupdate?.({ dir: (e.currentTarget as HTMLSelectElement).value }, 'Set section direction')}>
			{#each DIRS as [d, l] (d)}<option value={d}>{l}</option>{/each}
		</select></div>
{/if}
<div class="prop-sec">VIEWPORTS<span class="sec-hint">{links.length ? `${links.length} linked — they follow it live` : 'none yet'}</span>
	<button class="pp-mini sec-btn" title="Drop its view on the current sheet — again for another linked viewport" onclick={() => ondrop?.()}>+ Drop</button></div>
{#if links.length}
	<div class="sp-links">
		{#each links as l (l.did + l.frameId)}<button title="Open the sheet with this viewport selected" onclick={() => onopen?.(l)}>{l.sheet} · {l.frame}</button>{/each}
	</div>
{/if}
<button class="pp-del" onclick={() => ondelete?.()}>Delete section</button>
<div class="pp-hint">{line ? 'Drag its ends / the depth handle on the plan; click an end arrow to flip. Each viewport keeps its own notes, freezes and scale.' : 'Drag the box / its corners on the plan; its arrows drop the elevations.'}</div>

<style>
	.sp-links { display:flex; flex-wrap:wrap; gap:4px; padding:2px 0 6px; }
	.sp-links button { font-size:11px; color:var(--accent); background:none; border:1px solid var(--line-soft); border-radius:4px; padding:1px 6px; cursor:pointer; }
	.sp-links button:hover { background:var(--hover, #0e74901a); }
</style>
