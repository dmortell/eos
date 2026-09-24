<script lang="ts">
	// SEVERAL model objects selected (Ctrl/Shift-click, I4 / F8): the edits that make sense across them — layer,
	// colour (ByLayer = none), base Z (boxes) and height (boxes / walls / conduits). A field whose values differ
	// shows "— mixed —" / empty; setting it applies to every object that has it, as ONE undo step (onpatch).
	import { ColorPicker } from '$lib'
	import { COLORS } from '../../palette'
	import { num, strVal, blurOnEnter } from './fields'
	import type { Obj, Layer as MLayer } from '../../3dview/types'

	let { objs, layers, onpatch }: {
		objs: Obj[]; layers: MLayer[]
		/** Called once per edit: the patch for each object (null = leave it). */
		onpatch: (patchOf: (o: Obj) => Record<string, unknown> | null) => void
	} = $props()

	const LABEL: Record<string, string> = { prism: 'boxes', wall: 'walls', conduit: 'conduits' }
	const kinds = $derived([...new Set(objs.map((o) => o.type))])
	const title = $derived(kinds.length === 1 ? `${objs.length} ${(LABEL[kinds[0]] ?? 'objects').toUpperCase()}` : `${objs.length} MODEL OBJECTS`)
	/** The one value every object shares, else undefined (mixed). */
	function common<T>(get: (o: Obj) => T | undefined): T | undefined { const v = new Set(objs.map(get)); return v.size === 1 ? get(objs[0]) : undefined }
	const layer = $derived(common((o) => o.layer ?? ''))
	const color = $derived(common((o) => o.color))
	const mixedColor = $derived(new Set(objs.map((o) => o.color)).size > 1)
	const boxes = $derived(objs.filter((o) => o.type === 'prism'))
	const baseZ = $derived(boxes.length ? common((o) => (o.type === 'prism' ? Math.round(o.z) : undefined)) : undefined)
	const height = $derived(common((o) => ('h' in o ? Math.round(o.h as number) : undefined)))
</script>

<div class="prop-sec">{title}</div>
<div class="prop"><span>Layer</span>
	<select value={layer ?? ''} onchange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; if (v !== '~') onpatch(() => ({ layer: v || undefined })) }}>
		{#if layer === undefined}<option value="~">— mixed —</option>{/if}
		{#each layers as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
	</select>
</div>
<div class="prop"><span>Colour</span>
	<ColorPicker value={color} colors={COLORS} allowByLayer mixed={mixedColor} onchange={(v) => onpatch(() => ({ color: v }))} />
</div>
{#if boxes.length}
	<div class="prop"><span>Base Z</span><input type="number" value={baseZ ?? ''} placeholder="— mixed —" title="Boxes only: the underside's height above the floor (mm)"
		onchange={(e) => { if (!strVal(e).trim()) return; const v = Math.max(0, num(e)); onpatch((o) => (o.type === 'prism' ? { z: v } : null)) }} onkeydown={blurOnEnter} /></div>
{/if}
<div class="prop"><span>Height</span><input type="number" min="1" value={height ?? ''} placeholder="— mixed —" title="A box's height, a wall's or a conduit's default height (mm)"
	onchange={(e) => { if (!strVal(e).trim()) return; const v = Math.max(1, num(e)); onpatch((o) => ('h' in o ? { h: v } : null)) }} onkeydown={blurOnEnter} /></div>
<div class="pp-hint">Ctrl/Shift-click adds or removes objects. Edits apply to every selected object that has the field.</div>
