<!-- A riser view's FLOOR LIST (User 2026-10-21 — the best of the Risers tool's "Visible n/m" and the Sheets tool's
     hidden floors): a tick per floor, top down; Shift-click ticks or unticks every floor between it and the last one
     clicked; Show all; Hide empty floors (no server room — it follows the drawing). Hidden floors squeeze into a hatched
     "N floors hidden" band. Each riser tab / sheet viewport keeps its own list (`spec.hidden`). -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { ViewSpec } from '../views/space'
	import { riserFloors } from '../views/riser'

	type Riser = Extract<ViewSpec, { kind: 'riser' }>
	let { project, spec, onchange }: { project: CadProject; spec: Riser; onchange: (s: Riser) => void } = $props()

	const floors = $derived.by(() => { void project.rev; return riserFloors(project.index, spec.buildingId) })
	const off = $derived(new Set(spec.hidden ?? []))
	/** Shown: not ticked off, and not an empty floor while Hide empty floors is on. */
	const isShown = (f: { number: number; empty: boolean }) => !off.has(f.number) && !(spec.hideEmpty && f.empty)
	const shownCount = $derived(floors.filter(isShown).length)
	let open = $state(false)
	let last: number | null = null

	function put(hidden: Set<number>, hideEmpty = !!spec.hideEmpty) {
		const { hidden: _, hideEmpty: __, ...rest } = spec
		onchange({ ...rest, ...(hideEmpty ? { hideEmpty: true } : {}), ...(hidden.size ? { hidden: [...hidden].sort((a, b) => a - b) } : {}) })
	}
	function click(n: number, e: MouseEvent & { currentTarget: HTMLInputElement }) {
		const show = e.currentTarget.checked, next = new Set(off)
		const nums = e.shiftKey && last !== null && last !== n ? floors.map((f) => f.number).filter((x) => x >= Math.min(last!, n) && x <= Math.max(last!, n)) : [n]
		for (const x of nums) if (show) next.delete(x); else next.add(x)
		last = n
		put(next)
	}
</script>

<div class="rf">
	<button class="btn sum" title="Which floors this riser view shows — a tick per floor; Shift-click ticks a range" onclick={() => (open = !open)}>
		{open ? '▾' : '▸'} Floors: {shownCount} of {floors.length} shown
	</button>
	<label class="he" title="Leave out the floors with no server room (and no riser ending on them) — follows the drawing as rooms are added"><input type="checkbox" checked={!!spec.hideEmpty} onchange={(e) => put(off, e.currentTarget.checked)} /> Hide empty floors</label>
	{#if open}
		<div class="acts">
			<button class="btn" disabled={!off.size} title="Tick every floor again (Hide empty floors stays as it is)" onclick={() => put(new Set())}>Show all</button>
			<span class="tip">Shift-click: a range</span>
		</div>
		<ul>
			{#each floors as f (f.number)}
				<li class:dim={spec.hideEmpty && f.empty && !off.has(f.number)}>
					<label title={spec.hideEmpty && f.empty ? 'Empty — hidden by Hide empty floors' : f.empty ? 'No server room' : 'Has a server room'}>
						<input type="checkbox" checked={isShown(f)} disabled={spec.hideEmpty && f.empty} onclick={(e) => click(f.number, e as MouseEvent & { currentTarget: HTMLInputElement })} />
						{f.name}{#if !f.empty}<span class="sr" title="Has a server room">●</span>{/if}
					</label>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.rf { display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
	.btn { min-height: 20px; padding: 0 6px; font-size: 11px; border: 1px solid var(--cad-line); border-radius: 3px; background: var(--cad-input); color: var(--cad-text); text-align: left; }
	.btn:disabled { opacity: 0.5; }
	.he { display: flex; align-items: center; gap: 4px; }
	.acts { display: flex; align-items: center; gap: 8px; }
	.tip { font-size: 11px; color: var(--cad-faint); }
	ul { list-style: none; margin: 0; padding: 0; max-height: 16rem; overflow: auto; columns: 2; }
	li label { display: flex; align-items: center; gap: 4px; }
	li.dim { color: var(--cad-faint); }
	.sr { margin-left: 2px; font-size: 8px; color: #2563eb; }
</style>
