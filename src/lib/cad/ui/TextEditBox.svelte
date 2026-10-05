<!-- EDIT WORDS IN PLACE (backlog "Text options", "Edit a label in place"; Dave 2026-10-05): double-click (or F2) a
     text, a leader, an outlet, a rack or a run's label and its words open in a box on the drawing where they show.
     Enter saves (Shift+Enter: a new line in a text / leader), Tab / Shift+Tab save and go on to the next / previous
     thing of the same kind in reading order, Esc leaves it as it was; clicking away saves. One undo step each. An
     outlet's ports follow its new label (asking first when a printed panel would change). -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Entity } from '../domain/drawing'
	import type { ViewSpace } from '../views/space'
	import type { Prim } from '../views/display'
	import { toScreen, type Camera } from '../editor/camera'
	import { gripSpace } from '../editor/shapeGrips'
	import { PLOT_SCALE, primBounds } from '../views/display'
	import { labelKind, labelOf, withLabel } from '../domain/labelEdit'
	import { readingOrder } from '../domain/labels'
	import { untrack } from 'svelte'

	let { project, ws, space, cam, prims }: { project: CadProject; ws: Workspace; space: ViewSpace; cam: Camera; prims: Prim[] } = $props()

	const e = $derived(project.index.get<Entity>(ws.textEdit ?? undefined))
	const kind = $derived(labelKind(e))
	const ALIGN = { start: 'left', middle: 'centre', end: 'right' } as const
	/** Where its words start (view mm), how big they show, and which way they're aligned — null when not in this view. */
	function placeOf(x: Entity): { p: { x: number; y: number }; size: number; align: 'left' | 'centre' | 'right' } | null {
		if (x.type === 'shape' && (x.geom.kind === 'text' || x.geom.kind === 'leader')) {
			const g = x.geom, map = gripSpace(x, space, (id) => project.store.get(id))
			if (!map) return null
			const p = g.kind === 'text' ? g.at : g.pts[g.pts.length - 1]
			const k = space.spec.kind === 'sheet' ? 1 : PLOT_SCALE   // text sizes are paper mm: × the plot scale in a drawing
			return { p: map.to(p), size: (g.kind === 'text' ? g.sizeMm : 2.5) * k, align: g.kind === 'text' ? (g.align ?? 'left') : g.pts.length > 1 && p.x < g.pts[g.pts.length - 2].x ? 'right' : 'left' }
		}
		// an outlet, rack or run: where its words are drawn here (or the middle of it, when it has none yet)
		const mine = prims.filter((q) => q.src === x.id)
		const words = mine.filter((q): q is Extract<Prim, { k: 'text' }> => q.k === 'text'), now = labelOf(x)
		const t = words.find((q) => q.text === now) ?? words[0]
		if (t) return { p: t.at, size: t.size, align: ALIGN[t.anchor ?? 'start'] }
		if (!mine.length) return null
		const b = mine.map(primBounds).reduce((a, c) => ({ x0: Math.min(a.x0, c.x0), y0: Math.min(a.y0, c.y0), x1: Math.max(a.x1, c.x1), y1: Math.max(a.y1, c.y1) }))
		return { p: { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }, size: 10 / cam.k, align: 'centre' }
	}
	const at = $derived.by(() => {
		if (!e || !kind) return null
		const pl = placeOf(e)
		if (!pl) return null
		return { ...toScreen(cam, pl.p), px: Math.max(11, Math.min(40, pl.size * cam.k)), text: labelOf(e), align: pl.align, multi: kind === 'text' }
	})
	let box: HTMLTextAreaElement | undefined = $state()
	let done = false
	/** Lines typed so far: the box grows with them (also where `field-sizing` isn't supported). */
	let typed = $state<string | null>(null)
	const size = $derived.by(() => {
		const t = (typed ?? at?.text ?? '').split('\n')
		return { rows: Math.max(1, t.length), cols: Math.max(4, ...t.map((l) => l.length + 1)) }
	})
	$effect(() => { if (box) { box.focus(); box.select() } })
	// say how it works (Dave: Tab to the next label is the useful part — make it known)
	const NEXT = { outlet: 'outlet', rack: 'rack', run: 'run', text: 'text' } as const
	$effect(() => { if (kind) untrack(() => ws.say(`Enter saves${kind === 'text' ? ' (Shift+Enter: new line)' : ''} · Tab / Shift+Tab: save and edit the next / previous ${NEXT[kind]} · Esc cancels`)) })

	function save(): void {
		const was = e   // taken BEFORE textEdit clears: `e` is derived from it
		if (done || !was || !box) return
		done = true
		const next = withLabel(was, box.value)
		ws.textEdit = null
		if (!next) return
		const label = was.type === 'outlet' ? `Rename ${labelOf(was)} → ${labelOf(next)}` : was.type === 'rack' ? 'Rename rack' : was.type === 'shape' && (was.geom.kind === 'text' || was.geom.kind === 'leader') ? 'Edit text' : 'Run label'
		if (was.type === 'outlet') project.relabel(label, [next], ws.ask2)   // its ports follow; asks first if a printed panel changes
		else project.store.transact(label, (tx) => tx.put(next))
	}
	/** Tab: the next (Shift: previous) thing of the same kind shown here, in reading order (rows top-down, left → right). */
	function step(back: boolean): void {
		const was = e
		if (!was || !kind) return
		const ids = [...new Set(prims.map((q) => q.src).filter((id): id is string => !!id))]
		const same = ids.map((id) => project.index.get<Entity>(id)).filter((x): x is Entity => !!x && labelKind(x) === kind)
		const pos = new Map(same.map((x) => [x.id, placeOf(x)?.p]))
		const order = readingOrder(same, (x) => pos.get(x.id), space.spec.kind === 'sheet' ? 5 : 500)
		const i = order.findIndex((x) => x.id === was.id), next = order[(i + (back ? -1 : 1) + order.length) % order.length]
		save()
		if (next && next.id !== was.id) { ws.select([next.id]); ws.editText(next.id) }
	}
	function key(k: KeyboardEvent): void {
		k.stopPropagation()   // typing here is not a shortcut
		if (k.key === 'Enter' && (!k.shiftKey || !at?.multi)) { k.preventDefault(); save() }
		else if (k.key === 'Tab') { k.preventDefault(); step(k.shiftKey) }
		else if (k.key === 'Escape') { done = true; ws.textEdit = null }
	}
</script>

{#if at}
	<!-- anchored like the words: their left edge, centre or right edge on their point; it grows as lines are typed -->
	<textarea bind:this={box} class="edit a-{at.align}" style:left="{at.x}px" style:top="{at.y - at.px * 1.2}px" style:font-size="{at.px}px"
		rows={size.rows} cols={size.cols} value={at.text} onkeydown={key} oninput={(x) => (typed = x.currentTarget.value)} onblur={save} spellcheck="false"></textarea>
{/if}

<style>
	.edit { position: absolute; z-index: 5; min-width: 4rem; padding: 0 3px; line-height: 1.3; resize: none; overflow: hidden; white-space: pre;
		field-sizing: content; border: 1px solid #2563eb; border-radius: 3px;
		background: rgb(255 255 255 / 0.95); color: #0f172a; box-shadow: 0 2px 8px rgb(0 0 0 / 0.15); font-family: inherit; }
	.a-left { transform: translateX(-4px); text-align: left; }
	.a-centre { transform: translateX(-50%); text-align: center; }
	.a-right { transform: translateX(calc(-100% + 4px)); text-align: right; }
</style>
