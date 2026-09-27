<script lang="ts">
	// The SITE view (a test, Dave 2026-09-27): shown over the editor while the PROJECT is selected above the tree. It
	// asks for the site address (the project's Address field), finds it on OpenStreetMap (Nominatim), fetches the
	// buildings around it (Overpass) and renders THE building in 3D — its parts, facades, roof, floor lines — among its
	// neighbours on the OSM map (site/siteScene.ts, three.js). Nothing is stored except the address, when you save it.
	import { onDestroy } from 'svelte'
	import { Icon } from '$lib'
	import { geocode, fetchBuildings, toBuildings, pickTarget, partsOf, factsOf, type OsmPlace, type OsmBuilding } from '../site/osm'
	import type { SiteScene } from '../site/siteScene'

	let { projectName = 'Project', address = '', onsaveaddress, onclose }: { projectName?: string; address?: string; onsaveaddress?: (a: string) => void; onclose?: () => void } = $props()

	// svelte-ignore state_referenced_locally
	let q = $state(address)
	let status = $state<'idle' | 'searching' | 'loading' | 'ready' | 'none' | 'error'>('idle')
	let err = $state('')
	let matches = $state<OsmPlace[]>([])
	let place = $state<OsmPlace | null>(null)
	let target = $state<OsmBuilding | null>(null)
	let parts = $state<OsmBuilding[]>([])
	let count = $state(0)
	let tiles = $state(true)
	let host: HTMLDivElement | undefined = $state()
	let scene: SiteScene | null = null
	let seq = 0

	async function search(text = q) {
		if (!text.trim()) return
		const my = ++seq
		status = 'searching'; err = ''; matches = []; place = null; target = null; parts = []
		try {
			const ms = await geocode(text)
			if (my !== seq) return
			matches = ms
			if (!ms.length) { status = 'none'; return }
			await show(ms[0], my)
		} catch (e) { if (my === seq) { status = 'error'; err = (e as Error).message } }
	}
	async function show(p: OsmPlace, my = ++seq) {
		place = p; status = 'loading'; err = ''
		try {
			const js = await fetchBuildings(p.lat, p.lon, 250)
			if (my !== seq) return
			const bs = toBuildings(js, p.lat, p.lon)
			count = bs.filter((b) => !b.part).length
			target = pickTarget(bs, p); parts = target ? partsOf(bs, target) : []
			status = 'ready'
			await render(bs)
		} catch (e) { if (my === seq) { status = 'error'; err = (e as Error).message } }
	}
	async function render(bs: OsmBuilding[]) {
		scene?.dispose(); scene = null
		if (!host || !place) return
		const { createSiteScene } = await import('../site/siteScene')
		scene = await createSiteScene(host, { buildings: bs, target, parts, lat0: place.lat, lon0: place.lon, groundTiles: tiles })
	}
	// an address already on the project: look it up right away
	$effect(() => { if (address && status === 'idle') search(address) })
	$effect(() => { scene?.setGroundTiles(tiles) })
	onDestroy(() => { seq++; scene?.dispose() })

	const facts = $derived(target ? factsOf(target, parts) : [])
	const osmUrl = $derived(target ? `https://www.openstreetmap.org/${target.id.split('#')[0]}` : place ? `https://www.openstreetmap.org/#map=18/${place.lat}/${place.lon}` : '')
</script>

<div class="site">
	<div class="site-bar">
		<Icon name="mapPin" size={14} />
		<b>{projectName}</b><span class="site-sub">site</span>
		<form class="site-q" onsubmit={(e) => { e.preventDefault(); search() }}>
			<input bind:value={q} placeholder="Site address — street, number, city (e.g. 1-1-2 Yurakucho, Chiyoda, Tokyo)" aria-label="Site address" />
			<button type="submit" disabled={!q.trim() || status === 'searching' || status === 'loading'}>Find</button>
		</form>
		{#if q.trim() && q.trim() !== address.trim() && onsaveaddress}
			<button class="site-save" title="Save this as the project's Address (Properties › PROJECT)" onclick={() => onsaveaddress?.(q.trim())}>Save as project address</button>
		{/if}
		<label class="site-tiles" title="The OpenStreetMap map on the ground"><input type="checkbox" bind:checked={tiles} /> Map</label>
		{#if scene}<button class="site-ico" title="Frame the building" aria-label="Frame the building" onclick={() => scene?.frameTarget()}><Icon name="expand" size={13} /></button>{/if}
		<button class="site-ico" title="Close (back to the drawings)" aria-label="Close" onclick={() => onclose?.()}><Icon name="close" size={14} /></button>
	</div>

	<div class="site-body">
		<div class="site-3d" bind:this={host}></div>

		{#if status === 'idle' && !address}
			<div class="site-card">
				<Icon name="mapPin" size={28} />
				<h3>Where is this project?</h3>
				<p>Enter the site address above — the building is found on OpenStreetMap and shown here in 3D with its neighbours. Save it as the project address to see it every time you select the project.</p>
			</div>
		{:else if status === 'searching' || status === 'loading'}
			<div class="site-card small"><span class="spin"></span>{status === 'searching' ? 'Finding the address…' : 'Loading the buildings around it…'}</div>
		{:else if status === 'none'}
			<div class="site-card small">No match on OpenStreetMap — try the street and city, or the building's name.</div>
		{:else if status === 'error'}
			<div class="site-card small err">{err || 'Something went wrong'} — try again in a moment (the free OSM services limit requests).</div>
		{/if}

		{#if status === 'ready'}
			<div class="site-info">
				{#if target}
					<div class="si-title">{target.tags.name ?? target.tags['name:en'] ?? 'The building'}</div>
					{#each facts as [k, v] (k)}<div class="si-row"><span>{k}</span><b>{v}</b></div>{/each}
				{:else}
					<div class="si-title">No building at this point</div>
					<div class="si-note">OSM has no building outline here ({count} nearby) — pick another match below, or refine the address.</div>
				{/if}
				{#if matches.length > 1}
					<div class="si-sec">Other matches</div>
					{#each matches as m (m.lat + ',' + m.lon)}
						<button class="si-match" class:on={m === place} title={m.name} onclick={() => show(m)}>{m.name}</button>
					{/each}
				{/if}
				{#if osmUrl}<a class="si-link" href={osmUrl} target="_blank" rel="noopener noreferrer">Open on OpenStreetMap ↗</a>{/if}
			</div>
		{/if}
		<div class="site-attr">Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors · heights from OSM tags (estimated where untagged) · drag to orbit, right-drag to pan, wheel to zoom</div>
	</div>
</div>

<style>
	.site { position:absolute; inset:0; z-index:30; display:flex; flex-direction:column; background:var(--bg, #0f172a); }
	.site-bar { display:flex; align-items:center; gap:8px; padding:6px 10px; background:var(--panel); border-bottom:1px solid var(--line); color:var(--text); font-size:12px; }
	.site-sub { color:var(--muted); font-size:11px; }
	.site-q { flex:1; display:flex; gap:6px; min-width:0; }
	.site-q input { flex:1; min-width:0; background:var(--input); color:var(--text); border:1px solid var(--line); border-radius:5px; padding:5px 8px; font-size:12px; }
	.site-q input:focus { outline:none; border-color:var(--accent); }
	.site-q button, .site-save { background:var(--accent); color:#fff; border:none; border-radius:5px; padding:5px 12px; font-size:12px; font-weight:600; cursor:pointer; }
	.site-q button:disabled { opacity:.5; cursor:default; }
	.site-save { background:var(--input); color:var(--accent); border:1px solid var(--accent); }
	.site-tiles { display:flex; align-items:center; gap:4px; color:var(--muted); cursor:pointer; }
	.site-ico { background:none; border:none; color:var(--muted); cursor:pointer; padding:4px; border-radius:4px; display:flex; }
	.site-ico:hover { color:var(--text); background:var(--hover); }
	.site-body { position:relative; flex:1; min-height:0; }
	.site-3d { position:absolute; inset:0; }
	.site-card { position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); max-width:420px; text-align:center; background:var(--panel); color:var(--text); border:1px solid var(--line); border-radius:10px; padding:22px 26px; box-shadow:0 10px 30px #0006; }
	.site-card h3 { margin:8px 0 6px; font-size:16px; }
	.site-card p { margin:0; color:var(--muted); font-size:12px; line-height:1.5; }
	.site-card.small { padding:12px 18px; font-size:12px; display:flex; align-items:center; gap:10px; }
	.site-card.err { color:var(--danger, #f87171); }
	.spin { width:14px; height:14px; border:2px solid var(--line); border-top-color:var(--accent); border-radius:50%; animation:spin .8s linear infinite; }
	@keyframes spin { to { transform:rotate(360deg) } }
	.site-info { position:absolute; top:10px; right:10px; width:260px; max-height:calc(100% - 50px); overflow:auto; background:color-mix(in srgb, var(--panel) 92%, transparent); color:var(--text); border:1px solid var(--line); border-radius:8px; padding:10px 12px; font-size:12px; box-shadow:0 6px 20px #0005; }
	.si-title { font-size:14px; font-weight:700; margin-bottom:6px; }
	.si-row { display:flex; justify-content:space-between; gap:10px; padding:2px 0; }
	.si-row span { color:var(--muted); }
	.si-row b { text-align:right; font-weight:600; }
	.si-note { color:var(--muted); line-height:1.4; }
	.si-sec { margin-top:10px; font-size:10px; text-transform:uppercase; letter-spacing:.08em; color:var(--faint, #64748b); }
	.si-match { display:block; width:100%; text-align:left; background:none; border:1px solid transparent; border-radius:4px; color:var(--text); font-size:11px; padding:4px 6px; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; cursor:pointer; }
	.si-match:hover { background:var(--hover); }
	.si-match.on { border-color:var(--accent); }
	.si-link { display:block; margin-top:10px; color:var(--accent); font-size:11px; }
	.site-attr { position:absolute; left:8px; bottom:6px; font-size:10px; color:#334155; background:#ffffffcc; border-radius:4px; padding:2px 6px; }
	.site-attr a { color:inherit; }
</style>
