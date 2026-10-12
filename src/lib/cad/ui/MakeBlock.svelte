<!-- "Make block…" for drawn shapes (not inserts): the name is typed in a box under the button (not the status bar,
     Dave 2026-10-12); Enter turns the shapes into a global block with one insert in their place, selected. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Shape } from '../domain/shapes'
	import { untrack } from 'svelte'
	import NameInput from './NameInput.svelte'

	let { project, ws, shapes }: { project: CadProject; ws: Workspace; shapes: Shape[] } = $props()

	let naming = $state(false), busy = $state(false)
	$effect(() => { void ws.selection; untrack(() => { naming = false }) })   // another selection: the box goes
	async function make(name: string) {
		naming = false
		busy = true
		try { const id = await project.makeBlock(shapes.map((s) => s.id), name); if (id) ws.select([id]) }
		catch (e) { project.error = `Make block failed: ${(e as Error).message}` }
		finally { busy = false }
	}
</script>

{#if shapes.length}
	<div class="acts"><button class="btn" disabled={busy} title="Turn {shapes.length === 1 ? 'this shape' : 'the selected shapes'} into a global block and put one insert in their place" onclick={() => (naming = true)}>{shapes.length > 1 ? `Make block from ${shapes.length} shapes…` : 'Make block…'}</button></div>
	{#if naming}
		<div class="row"><span class="muted">Block name</span>
			<NameInput wide create value="" placeholder="Its name — Enter makes it" title="Enter: make the block · Esc: cancel" onsave={make} oncancel={() => (naming = false)} /></div>
	{/if}
{/if}
