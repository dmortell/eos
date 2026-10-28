<!-- The PORT TIP over a rack view (backlog "Port hover tips"): at once (no delay), beside the pointer, for the port
     under it — its place and full label, the cable plugged in, its cords, and how the device's ports are used
     (views/portTip.ts). Hidden while a button is held (dragging) and off the ports.
     The port itself lights up, its number large over it (User 2026-10-17: the ports are tiny — "try lighting up
     ports first", before a loupe): what a click takes, readable at any zoom. -->
<script lang="ts">
	import type { ProjectIndex } from '../domain/project'
	import type { Prim } from '../views/display'
	import type { Pt, PortRef } from '../domain/types'
	import { untrack } from 'svelte'
	import { toScreen, type Camera } from '../editor/camera'
	import { portCellUnder, portTip, portTipUse } from '../views/portTip'
	import { cordAt } from '../domain/cords'

	let { ix, prims, cursor, cam, face, dragging, grab = false, onport }: { ix: ProjectIndex; prims: Prim[]; cursor: Pt | null; cam: Camera; face: 'front' | 'rear'; dragging: boolean
		/** the Select tool: Alt-drag from a port takes the device — said in the tip, and with Alt held the port isn't lit */
		grab?: boolean
		/** told the port under the pointer (null off the ports): every pane lights its far ends */
		onport?: (r: PortRef | null) => void } = $props()

	let alt = $state(false)
	const onKey = (e: KeyboardEvent) => { alt = e.altKey }
	const cell = $derived(cursor && !dragging ? portCellUnder(prims, cursor) : null)
	const port = $derived(cell ? { on: cell.src!, port: Number(cell.sub), face } : null)
	// untracked: the callback reads and writes the workspace's hover port (tracked, it looped)
	$effect(() => { const p = port; untrack(() => onport?.(p)) })
	const lines = $derived(port ? portTip(ix, port) : [])
	const use = $derived(port ? portTipUse(ix, port) : '')
	// the Select tool: a drag from a patched port takes its cord's end (its cord on this face)
	const cordHere = $derived.by(() => {
		const c = port && grab ? cordAt(ix, port) : undefined, end = c && (c.a.on === port!.on && c.a.port === port!.port ? c.a : c.b)
		return !!end && (end.face ?? 'front') === face
	})
	const at = $derived(cursor ? toScreen(cam, cursor) : { x: 0, y: 0 })
	// the cell on screen
	const box = $derived.by(() => {
		if (!cell) return null
		const s = cell.pts.map((p) => toScreen(cam, p)), xs = s.map((p) => p.x), ys = s.map((p) => p.y)
		const x0 = Math.min(...xs), y0 = Math.min(...ys)
		return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 }
	})
</script>

<svelte:window onkeydown={onKey} onkeyup={onKey} onblur={() => (alt = false)} />

{#if box && port && !(grab && alt)}
	<div class="lit" style:left="{box.x}px" style:top="{box.y}px" style:width="{box.w}px" style:height="{box.h}px"></div>
	<div class="num" style:left="{box.x + box.w / 2}px" style:top="{box.y}px">{port.port}</div>
{/if}
{#if lines.length}
	<div class="tip" style:left="{at.x + 14}px" style:top="{at.y + 14}px">
		{#each lines as l, i (i)}<div class:head={i === 0} class:lbl={i === 1 && !l.includes('→')}>{l}</div>{/each}
		{#if use}<div class="use">{use}</div>{/if}
		{#if grab}<div class="use">{alt ? 'Drag moves the device · with Ctrl, copies it' : `${cordHere ? 'Drag takes this cord’s end to another port · ' : ''}Alt-drag moves the device · Ctrl+Alt-drag copies it`}</div>{/if}
	</div>
{/if}

<style>
	.tip { position: absolute; z-index: 6; pointer-events: none; max-width: 26rem; padding: 3px 7px; border-radius: 4px; font-size: 11px; line-height: 1.35;
		background: rgb(15 23 42 / 0.92); color: #e2e8f0; box-shadow: 0 2px 8px rgb(0 0 0 / 0.25); white-space: nowrap; }
	.head { color: #94a3b8; }
	.use { color: #94a3b8; border-top: 1px solid rgb(148 163 184 / 0.3); margin-top: 2px; padding-top: 1px; }
	.lbl { font-family: ui-monospace, monospace; font-weight: 600; color: #fff; }
	/* at least 6 px, so a speck of a port still shows */
	.lit { position: absolute; z-index: 5; pointer-events: none; min-width: 6px; min-height: 6px; box-sizing: border-box;
		background: rgb(250 204 21 / 0.55); outline: 2px solid #f59e0b; outline-offset: 0; }
	.num { position: absolute; z-index: 6; pointer-events: none; transform: translate(-50%, calc(-100% - 4px)); padding: 0 5px; border-radius: 3px;
		font: 600 13px/18px ui-monospace, monospace; background: #f59e0b; color: #111827; box-shadow: 0 1px 4px rgb(0 0 0 / 0.3); }
</style>
