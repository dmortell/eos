<script lang="ts">
	// E8 / E9: ALLOCATE outlets to a patch panel's ports. Left: the floor's outlets (search; "not allocated" only by
	// default — E9's unallocated list); tick several, or drag one / the ticked ones onto a panel port — their ports
	// fill the panel from there, in order (store/allocate.ts). Right: the panel's ports, 24 to a row, each showing
	// the outlet port it serves; click ports to pick them, then Free. Every change applies at once (one undo step).
	import { Icon } from '$lib'
	import { tick } from 'svelte'
	import { allocate, unallocate, type OutletRef, type PortAlloc } from '../store/allocate'

	let { panel, ports, alloc, outlets, allocated, onapply, onclose }: {
		panel: string; ports: number; alloc: Record<string, PortAlloc>
		outlets: (OutletRef & { modelName: string })[]
		/** Every allocated outlet → where (this panel included). */
		allocated: Map<string, string>
		onapply: (alloc: Record<string, PortAlloc>) => void; onclose: () => void
	} = $props()

	let search = $state(''), onlyFree = $state(true), start = $state(1)
	let ticked = $state<string[]>([]), picked = $state<number[]>([])
	const here = $derived(new Set(Object.values(alloc).map((a) => a.outlet)))
	const shown = $derived(outlets.filter((o) => (!onlyFree || !allocated.has(o.id) || here.has(o.id)) && (!search || o.label.toLowerCase().includes(search.toLowerCase())))
		.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })))
	const used = $derived(Object.keys(alloc).length)
	const rows = $derived(Array.from({ length: Math.ceil(ports / 24) }, (_, r) => Array.from({ length: Math.min(24, ports - r * 24) }, (_, c) => r * 24 + c + 1)))

	let note = $state('')
	function place(ids: string[], at: number) {
		const list = ids.map((id) => outlets.find((o) => o.id === id)).filter((o): o is OutletRef & { modelName: string } => !!o)
		if (!list.length) return
		const r = allocate(alloc, ports, list, at)
		onapply(r.alloc)
		note = r.overflow.length ? `No room from port ${at} for ${r.overflow.map((o) => o.label).join(', ')}` : ''
		ticked = []
		const last = Math.max(0, ...Object.keys(r.alloc).map(Number)); start = Math.min(ports, last + 1)
	}
	function free() { if (picked.length) { onapply(unallocate(alloc, { ports: picked })); picked = [] } }
	function togglePort(p: number) { picked = picked.includes(p) ? picked.filter((x) => x !== p) : [...picked, p] }
	// drag: one outlet, or all the ticked ones when it's among them
	let dragIds: string[] = []
	function onDragStart(e: DragEvent, id: string) { dragIds = ticked.includes(id) ? [...ticked] : [id]; e.dataTransfer?.setData('text/plain', dragIds.join(',')) }
	let overPort = $state<number | null>(null)
	function onKey(e: KeyboardEvent) { if (e.key === 'Escape') { e.preventDefault(); onclose() } }
	function focusFirst(node: HTMLElement) { tick().then(() => node.querySelector('input')?.focus()) }
</script>

<svelte:window onkeydown={onKey} />
<div class="ad-back">
	<button class="ad-dismiss" aria-label="Close" tabindex="-1" onclick={onclose}></button>
	<div class="ad" role="dialog" aria-modal="true" aria-label="Allocate outlets" tabindex="-1" use:focusFirst>
		<div class="ad-head"><span>Allocate outlets → {panel} · {used}/{ports} ports used</span><button class="ad-x" title="Close (Esc)" onclick={onclose}><Icon name="x" size={15} /></button></div>
		<div class="ad-body">
			<div class="ad-list">
				<input class="ad-search" placeholder="Search outlets…" bind:value={search} />
				<label class="ad-chk"><input type="checkbox" bind:checked={onlyFree} /> not allocated yet</label>
				<div class="ad-rows">
					{#each shown as o (o.id)}
						{@const where = allocated.get(o.id)}
						<label class="ad-row" class:done={!!where} draggable="true" ondragstart={(e) => onDragStart(e, o.id)} title={where ? `Allocated: ${where}` : o.modelName}>
							<input type="checkbox" checked={ticked.includes(o.id)} onchange={() => (ticked = ticked.includes(o.id) ? ticked.filter((x) => x !== o.id) : [...ticked, o.id])} />
							<b>{o.label}</b><em>{o.ports}p</em>{#if where}<span class="ad-where">{where}</span>{/if}
						</label>
					{:else}
						<div class="ad-empty">{outlets.length ? 'No outlets match' : 'No outlets on this floor’s models — import outlets first'}</div>
					{/each}
				</div>
				<div class="ad-act">
					<span>from port</span><input type="number" min="1" max={ports} bind:value={start} />
					<button class="primary" disabled={!ticked.length} onclick={() => place(ticked, start)}>Allocate {ticked.length || ''}</button>
				</div>
			</div>
			<div class="ad-panel">
				{#each rows as row, ri (ri)}
					<div class="ad-prow">
						{#each row as p (p)}
							{@const a = alloc[p]}
							<button class="ad-port" class:used={!!a} class:picked={picked.includes(p)} class:over={overPort === p} title={a ? `${p}: ${a.label}` : `Port ${p} — drop outlets here`}
								onclick={() => (a ? togglePort(p) : (start = p))}
								ondragover={(e) => { e.preventDefault(); overPort = p }} ondragleave={() => { if (overPort === p) overPort = null }}
								ondrop={(e) => { e.preventDefault(); overPort = null; place(dragIds, p); dragIds = [] }}>
								<i>{p}</i>{#if a}<span>{a.label}</span>{/if}
							</button>
						{/each}
					</div>
				{/each}
				<div class="ad-act">
					<button disabled={!picked.length} onclick={free}>Free {picked.length || ''} port{picked.length === 1 ? '' : 's'}</button>
					<button disabled={!used} onclick={() => onapply({})}>Clear panel</button>
				</div>
			</div>
		</div>
		<div class="ad-foot">{note || 'Tick outlets and Allocate, or drag them onto a port. Multi-port outlets take consecutive ports (.A, .B …). Saved in Pages (not yet the Frames tool).'}</div>
	</div>
</div>

<style>
	.ad-back { position:fixed; inset:0; z-index:200; background:#0007; display:flex; align-items:flex-start; justify-content:center; padding-top:6vh; }
	.ad-dismiss { position:absolute; inset:0; background:none; border:none; cursor:default; }
	.ad { position:relative; width:min(1100px,96vw); max-height:86vh; display:flex; flex-direction:column; background:var(--panel); border:1px solid var(--line); border-radius:10px; box-shadow:0 24px 70px #0009; overflow:hidden; color:var(--text); }
	.ad-head { display:flex; align-items:center; justify-content:space-between; padding:10px 14px; border-bottom:1px solid var(--line-soft); font-size:12px; font-weight:700; }
	.ad-x { background:none; border:none; color:var(--muted); cursor:pointer; display:grid; place-items:center; }
	.ad-body { display:flex; min-height:0; flex:1; }
	.ad-list { width:280px; flex:none; display:flex; flex-direction:column; border-right:1px solid var(--line-soft); padding:8px; gap:6px; min-height:0; }
	.ad-search, .ad-act input { background:var(--input); color:var(--text); border:1px solid var(--line); border-radius:4px; padding:4px 6px; font-size:12px; }
	.ad-chk { font-size:11px; color:var(--muted); display:flex; gap:5px; align-items:center; }
	.ad-rows { flex:1; overflow-y:auto; min-height:120px; }
	.ad-row { display:flex; align-items:center; gap:6px; padding:3px 4px; font-size:12px; border-radius:4px; cursor:grab; }
	.ad-row:hover { background:var(--hover); }
	.ad-row b { font-weight:600; font-family:Consolas,monospace; }
	.ad-row em { font-style:normal; color:var(--faint); font-size:10px; }
	.ad-row.done b { color:var(--muted); }
	.ad-where { margin-left:auto; font-size:10px; color:var(--accent); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:120px; }
	.ad-empty { font-size:11px; color:var(--faint); padding:8px; }
	.ad-act { display:flex; align-items:center; gap:6px; font-size:11px; color:var(--muted); }
	.ad-act input { width:56px; }
	.ad-act button { padding:4px 10px; font-size:12px; border-radius:5px; border:1px solid var(--line); background:var(--panel2); color:var(--text); cursor:pointer; }
	.ad-act button.primary { background:var(--accent); color:#fff; border-color:var(--accent); }
	.ad-act button:disabled { opacity:.45; cursor:default; }
	.ad-panel { flex:1; overflow:auto; padding:10px; display:flex; flex-direction:column; gap:6px; }
	.ad-prow { display:grid; grid-template-columns:repeat(24, minmax(34px, 1fr)); gap:2px; }
	.ad-port { height:54px; border:1px solid var(--line); border-radius:3px; background:var(--input); color:var(--text); display:flex; flex-direction:column; align-items:center; justify-content:flex-start; padding:2px 1px; cursor:pointer; overflow:hidden; }
	.ad-port i { font-style:normal; font-size:9px; color:var(--faint); }
	.ad-port span { font-size:9px; font-family:Consolas,monospace; writing-mode:vertical-rl; transform:rotate(180deg); max-height:38px; overflow:hidden; }
	.ad-port.used { background:color-mix(in srgb, var(--accent) 18%, var(--input)); border-color:var(--accent-dim); }
	.ad-port.picked { outline:2px solid #f59e0b; }
	.ad-port.over { outline:2px dashed var(--accent); }
	.ad-foot { padding:8px 14px; font-size:10px; color:var(--faint); border-top:1px solid var(--line-soft); }
</style>
