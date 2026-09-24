<script lang="ts">
	// A building's per-floor HEIGHTS, edited (Properties › HEIGHTS › Edit heights…). One row per floor, top first:
	// slab / raised floor / clear height / plenum in mm; the level column is where each floor's slab top ends up.
	// "All floors" applies one value to every floor (one undo step). Every edit re-stacks the floors above.
	import { tick } from 'svelte'
	import { Icon } from '$lib'
	type Key = 'slabMm' | 'raisedFloorMm' | 'clearHeightMm' | 'plenumMm'
	type Row = { id: string; name: string; z: number } & Record<Key, number>
	let { title, rows, onheight, onall, onclose }: {
		title: string; rows: Row[]
		onheight: (storeyId: string, key: Key, value: number) => void
		onall: (key: Key, value: number) => void
		onclose: () => void
	} = $props()

	const COLS: { key: Key; label: string; hint: string }[] = [
		{ key: 'slabMm', label: 'Slab', hint: 'Structural slab thickness' },
		{ key: 'raisedFloorMm', label: 'Raised floor', hint: 'Raised (access) floor height above the slab' },
		{ key: 'clearHeightMm', label: 'Clear height', hint: 'Raised floor to ceiling' },
		{ key: 'plenumMm', label: 'Plenum', hint: 'Ceiling void, up to the slab above' },
	]
	const val = (e: Event) => Math.round(+(e.currentTarget as HTMLInputElement).value)
	const blurOnEnter = (e: KeyboardEvent) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur() }
	function onKey(e: KeyboardEvent) { if (e.key === 'Escape') { e.preventDefault(); onclose() } }
	function focusFirst(node: HTMLElement) { tick().then(() => node.querySelector('input')?.focus()) }
</script>

<svelte:window onkeydown={onKey} />
<div class="hd-back">
	<button class="hd-dismiss" aria-label="Close" tabindex="-1" onclick={onclose}></button>
	<div class="hd" role="dialog" aria-modal="true" aria-label="Floor heights" tabindex="-1" use:focusFirst>
		<div class="hd-head"><span>Floor heights · {title}</span><button class="hd-x" title="Close (Esc)" onclick={onclose}><Icon name="x" size={15} /></button></div>
		<div class="hd-body">
			<table>
				<thead>
					<tr><th>Floor</th>{#each COLS as c (c.key)}<th title={c.hint}>{c.label}<em>mm</em></th>{/each}<th title="Slab top above the lowest floor">Level<em>m</em></th></tr>
				</thead>
				<tbody>
					<tr class="all"><th title="Set a column for every floor">All floors</th>
						{#each COLS as c (c.key)}<td><input type="number" min="0" step="50" placeholder="set all…" onchange={(e) => { const v = val(e); if (v >= 0) onall(c.key, v); (e.currentTarget as HTMLInputElement).value = '' }} onkeydown={blurOnEnter} /></td>{/each}
						<td></td></tr>
					{#each rows as r (r.id)}
						<tr><th>{r.name}</th>
							{#each COLS as c (c.key)}<td><input type="number" min="0" step="50" value={r[c.key]} onchange={(e) => { const v = val(e); if (v >= 0) onheight(r.id, c.key, v) }} onkeydown={blurOnEnter} /></td>{/each}
							<td class="lvl">{(r.z / 1000).toFixed(2)}</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
		<div class="hd-foot">Changes apply as you go (Ctrl+Z undoes). Floors above an edit move up / down with it, and the imported riser geometry follows.</div>
	</div>
</div>

<style>
	.hd-back { position:fixed; inset:0; z-index:200; background:#0007; display:flex; align-items:flex-start; justify-content:center; padding-top:8vh; }
	.hd-dismiss { position:absolute; inset:0; background:none; border:none; cursor:default; }
	.hd { position:relative; width:min(640px,94vw); max-height:80vh; display:flex; flex-direction:column; background:var(--panel); border:1px solid var(--line); border-radius:10px; box-shadow:0 24px 70px #0009; overflow:hidden; }
	.hd-head { display:flex; align-items:center; justify-content:space-between; padding:10px 14px; border-bottom:1px solid var(--line-soft); font-size:12px; font-weight:700; color:var(--text); }
	.hd-x { background:none; border:none; color:var(--muted); cursor:pointer; display:grid; place-items:center; }
	.hd-body { overflow:auto; padding:6px 10px; }
	table { width:100%; border-collapse:collapse; font-size:12px; color:var(--text); }
	thead th { position:sticky; top:0; background:var(--panel); text-align:left; font-size:10px; font-weight:600; letter-spacing:.04em; color:var(--faint); padding:6px 4px; white-space:nowrap; }
	thead em { font-style:normal; font-weight:400; margin-left:3px; }
	tbody th { text-align:left; font-weight:500; font-family:Consolas,monospace; padding:2px 6px 2px 2px; white-space:nowrap; }
	td { padding:2px 3px; }
	input { width:90px; background:var(--input); color:var(--text); border:1px solid var(--line); border-radius:4px; padding:3px 6px; font-size:12px; font-family:Consolas,monospace; }
	input:focus { outline:none; border-color:var(--accent); }
	tr.all th, tr.all input::placeholder { color:var(--muted); }
	tr.all td, tr.all th { padding-bottom:6px; border-bottom:1px solid var(--line-soft); }
	td.lvl { color:var(--muted); font-family:Consolas,monospace; text-align:right; }
	.hd-foot { padding:8px 14px; font-size:10px; color:var(--faint); border-top:1px solid var(--line-soft); }
</style>
