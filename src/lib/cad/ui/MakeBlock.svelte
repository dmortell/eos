<!-- "Make block…" for drawn shapes (not inserts): the name is typed in a box under the button (not the status bar,
     Dave 2026-10-12); Enter turns the shapes into a global block with one insert in their place, selected. Shapes drawn
     in an elevation or section become a block's FRONT drawing instead: of a new block, or of one of yours. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Shape } from '../domain/shapes'
	import { untrack } from 'svelte'
	import NameInput from './NameInput.svelte'
	import { frontProblem } from '../domain/blocks'

	let { project, ws, shapes }: { project: CadProject; ws: Workspace; shapes: Shape[] } = $props()

	let naming = $state(false), busy = $state(false)
	$effect(() => { void ws.selection; untrack(() => { naming = false }) })   // another selection: the box goes
	/** Drawn in an elevation / section: it becomes the block's front drawing, not its plan symbol. */
	const front = $derived(shapes.length > 0 && frontProblem(shapes) === null)
	/** Your own blocks (a built-in's front is in code). */
	const mine = $derived(front ? [...project.blocks.values()].filter((b) => !b.builtin && !b.retired).sort((a, b) => a.name.localeCompare(b.name)) : [])
	async function make(name: string) {
		naming = false
		busy = true
		try {
			const id = front ? await project.makeBlockFront(shapes.map((s) => s.id), { name }) : await project.makeBlock(shapes.map((s) => s.id), name)
			if (id) { ws.select([id]); if (front) ws.say(`Block ${name}: elevations and sections show its front drawing; place more with the Insert tool`) }
		}
		catch (e) { project.error = `Make block failed: ${(e as Error).message}` }
		finally { busy = false }
	}
	async function addTo(blockId: string) {
		if (!blockId) return
		busy = true
		try {
			const id = await project.makeBlockFront(shapes.map((s) => s.id), { blockId })
			if (id) { ws.select([id]); ws.say(`${project.blockOf(blockId)?.name ?? 'The block'} now has this front drawing (it replaced its old one)`) }
		}
		catch (e) { project.error = `Make front failed: ${(e as Error).message}` }
		finally { busy = false }
	}
</script>

{#if shapes.length}
	{@const what = shapes.length === 1 ? 'this shape' : 'the selected shapes'}
	<div class="acts"><button class="btn" disabled={busy}
		title={front ? `Turn ${what}, drawn in this elevation, into the front drawing of a new global block and put one insert in their place (a plan shows it as a box)` : `Turn ${what} into a global block and put one insert in their place`}
		onclick={() => (naming = true)}>{shapes.length > 1 ? `Make block from ${shapes.length} shapes…` : 'Make block…'}</button></div>
	{#if naming}
		<div class="row"><span class="muted">Block name</span>
			<NameInput wide create value="" placeholder="Its name — Enter makes it" title="Enter: make the block · Esc: cancel" onsave={make} oncancel={() => (naming = false)} /></div>
	{/if}
	{#if front && mine.length}
		<div class="row"><span class="muted">or its front</span>
			<select class="inp" disabled={busy} aria-label="Add as the front drawing of one of your blocks" title="Replace the front drawing of one of your blocks with this"
				onchange={(e) => { const v = e.currentTarget.value; e.currentTarget.value = ''; addTo(v) }}>
				<option value="">Add as the front of…</option>
				{#each mine as b (b.id)}<option value={b.id}>{b.name}</option>{/each}
			</select></div>
	{/if}
{/if}
