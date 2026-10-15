<!-- BLOCK ATTRIBUTES on one or several inserts (backlog "Block attributes on an insert", User 2026-10-05): each attribute
     their blocks have (declared, or a `{TAG}` in a text) with its value — "mixed" where they differ — and Shown:
     unticked keeps the value as data but doesn't draw it (hidden). Blank = the block's default. One undo step per edit. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Shape } from '../domain/shapes'
	import { blockAttrDefs } from '../domain/blocks'
	import PropGroup from './PropGroup.svelte'
	import { shared, MIXED } from './propsKit'

	let { project, inserts }: { project: CadProject; inserts: Shape[] } = $props()

	type Ins = Shape & { geom: Extract<Shape['geom'], { kind: 'insert' }> }
	const list = $derived(inserts.filter((s): s is Ins => s.geom.kind === 'insert'))
	/** Every attribute of their blocks, and which inserts have it. */
	const defs = $derived.by(() => {
		const by = new Map<string, { tag: string; label: string; default?: string; on: Ins[] }>()
		for (const s of list) {
			const b = project.blockOf(s.geom.blockId)
			for (const d of b ? blockAttrDefs(b) : []) { const x = by.get(d.tag) ?? { ...d, on: [] }; x.on.push(s); by.set(d.tag, x) }
		}
		return [...by.values()]
	})

	function each(xs: Ins[], label: string, f: (g: Ins['geom']) => Ins['geom']) {
		project.store.transact(xs.length > 1 ? `${label} (${xs.length})` : label, (tx) => { for (const s of xs) tx.put({ ...s, geom: f(s.geom) }) })
	}
	function setValue(tag: string, xs: Ins[], v: string) {
		each(xs, `Attribute ${tag}`, (g) => {
			const a = { ...g.attrs }
			if (v) a[tag] = v; else delete a[tag]
			return { ...g, attrs: Object.keys(a).length ? a : undefined }
		})
	}
	function setShown(tag: string, xs: Ins[], shown: boolean) {
		each(xs, shown ? `Show ${tag}` : `Hide ${tag}`, (g) => {
			const h = new Set(g.hidden ?? [])
			if (shown) h.delete(tag); else h.add(tag)
			return { ...g, hidden: h.size ? [...h] : undefined }
		})
	}
</script>

{#if defs.length}
	<PropGroup kind="block" title="Attributes">
	{#each defs as d (d.tag)}
		{@const v = shared(d.on, (s) => s.geom.attrs?.[d.tag] ?? '')}
		{@const hid = d.on.filter((s) => s.geom.hidden?.includes(d.tag)).length}
		<div class="att" title="{d.tag}{d.on.length < list.length ? ` (${d.on.length} of the ${list.length} have it)` : ''}">
			<span class="nm">{d.label}</span>
			<input class="inp" value={v.value ?? ''} placeholder={v.mixed ? MIXED : (d.default ?? '')} onchange={(e) => setValue(d.tag, d.on, e.currentTarget.value.trim())} />
			<label class="sh" title="Shown on the drawing (unticked: kept as data, not drawn)"><input type="checkbox" checked={hid === 0} indeterminate={hid > 0 && hid < d.on.length} onchange={(e) => setShown(d.tag, d.on, e.currentTarget.checked)} /> shown</label>
		</div>
	{/each}
	</PropGroup>
{/if}

<style>
	.att { display: grid; grid-template-columns: 6.5rem 1fr auto; align-items: center; gap: 0.25rem; }
	.nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.sh { font-size: 11px; color: var(--cad-muted); white-space: nowrap; }
</style>
