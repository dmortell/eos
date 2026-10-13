<!-- "Make block…" for drawn shapes (not inserts): the name is typed in a box under the button (not the status bar,
     Dave 2026-10-12); Enter turns the shapes into a global block with one insert in their place, selected. Shapes drawn
     in an elevation or section make a block as seen there, and its insert stays in that view. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Shape } from '../domain/shapes'
	import { untrack } from 'svelte'
	import NameInput from './NameInput.svelte'
	import { elevationProblem, paperBlockScale } from '../domain/blocks'

	let { project, ws, shapes }: { project: CadProject; ws: Workspace; shapes: Shape[] } = $props()

	let naming = $state(false), busy = $state(false)
	$effect(() => { void ws.selection; untrack(() => { naming = false }) })   // another selection: the box goes
	/** Drawn in an elevation / section. */
	const inElevation = $derived(shapes.length > 0 && elevationProblem(shapes) === null)
	async function make(name: string) {
		naming = false
		busy = true
		const first = shapes[0], sh = first?.sheetId ? project.store.get(first.sheetId) : undefined
		const k = paperBlockScale(shapes, sh?.type === 'sheet' ? sh : undefined), untied = !!first?.sheetId && !first.vpId   // read before the shapes go
		try {
			const id = await project.makeBlock(shapes.map((s) => s.id), name)
			if (id) {
				ws.select([id])
				if (inElevation) ws.say(`Block ${name} made; this insert shows in this elevation only — place more with the Insert tool`)
				else if (untied) ws.say(k ? `Block ${name} made at model size (the sheet’s first viewport, 1:${k}); the insert on the paper shows it at the same size` : `Block ${name} made at paper size (the sheet has no viewport)`)
			}
		}
		catch (e) { project.error = `Make block failed: ${(e as Error).message}` }
		finally { busy = false }
	}
</script>

{#if shapes.length}
	{@const what = shapes.length === 1 ? 'this shape' : 'the selected shapes'}
	<div class="acts"><button class="btn" disabled={busy}
		title={inElevation ? `Turn ${what}, drawn in this elevation, into a global block and put one insert in their place (shown in this elevation)` : `Turn ${what} into a global block and put one insert in their place`}
		onclick={() => (naming = true)}>{shapes.length > 1 ? `Make block from ${shapes.length} shapes…` : 'Make block…'}</button></div>
	{#if naming}
		<div class="row"><span class="muted">Block name</span>
			<NameInput wide create value="" placeholder="Its name — Enter makes it" title="Enter: make the block · Esc: cancel" onsave={make} oncancel={() => (naming = false)} /></div>
	{/if}
{/if}
