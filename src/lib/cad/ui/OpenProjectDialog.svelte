<script lang="ts">
	import { composing } from './keyGuards'
	// cad: File › Open project… (Ctrl+O) — ported from the Pages tool (backlog "Open project (Ctrl+O)"); picking one
	// opens it in cad. Pick a project from Firestore `projects` — the same collection and
	// filters as the app's Projects page (src/routes/projects/Projects.svelte): trashed projects hidden, a
	// search over name / codes / client / description, and "My projects" by ownerId. Enter or click opens
	// the pick; ↑/↓ move; Esc / backdrop closes (CadDialog).
	import { getContext, tick } from 'svelte'
	import { Icon, type Firestore, type Session } from '$lib'
	import { formatDate } from '$lib/utils/date'
	import CadDialog from './CadDialog.svelte'

	type Project = { id: string; name?: string; clientCode?: string; projectCode?: string; client?: string; description?: string;
		ownerId?: string; deleted?: boolean; updatedAt?: unknown; createdAt?: unknown }
	let { currentId = '', onpick, onclose }: { currentId?: string; onpick?: (id: string) => void; onclose?: () => void } = $props()

	const db = getContext('db') as Firestore
	const session = getContext('session') as Session | undefined
	const cfg = getContext<{ locale: string } | undefined>('settings')
	function autofocus(node: HTMLInputElement) { tick().then(() => node.focus()) }

	let projects = $state<Project[]>([])
	let loading = $state(true), loadError = $state('')
	let query = $state('')
	let mine = $state(false)
	let sel = $state(0)
	$effect(() => {
		const unsub = db.subscribeMany('projects', (data) => { projects = data as unknown as Project[]; loading = false }, (e) => { loadError = `Could not load the projects: ${(e as Error)?.message ?? e}`; loading = false })
		return () => { unsub?.() }
	})

	const text = (p: Project) => [p.name, p.projectCode, p.clientCode, p.client, p.description].filter(Boolean).join(' ').toLowerCase()
	// Newest-touched first, so the project you were just in is near the top.
	const stamp = (v: unknown): number => {
		const d = v as { toMillis?: () => number; seconds?: number } | string | number | Date | undefined
		if (!d) return 0
		if (typeof d === 'object' && 'toMillis' in d && d.toMillis) return d.toMillis()
		if (typeof d === 'object' && 'seconds' in d && d.seconds != null) return d.seconds * 1000
		const t = new Date(d as string | number | Date).getTime(); return isNaN(t) ? 0 : t
	}
	let results = $derived.by(() => {
		const q = query.trim().toLowerCase(), uid = session?.user?.uid
		return projects
			.filter((p) => !p.deleted && (!mine || p.ownerId === uid) && (!q || text(p).includes(q)))
			.sort((a, b) => stamp(b.updatedAt ?? b.createdAt) - stamp(a.updatedAt ?? a.createdAt))
	})
	$effect(() => { results; sel = 0 })   // reset the highlight when the list changes

	function choose(p: Project | undefined) { if (p) { onpick?.(p.id); onclose?.() } }
	function onKey(e: KeyboardEvent) {
		if (composing(e)) return   // the IME's ↑ / ↓ / Enter (picking, committing a conversion)
		if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, results.length - 1) }
		else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0) }
		else if (e.key === 'Enter') { e.preventDefault(); choose(results[sel]) }
	}
</script>

<CadDialog label="Open project" width="620px" top="12vh" flush onclose={() => onclose?.()}>
	{#snippet head()}
		<b>Open project</b>
		<label class="op-mine"><input type="checkbox" bind:checked={mine} /> My projects</label>
	{/snippet}
	{#snippet bar()}
		<div class="op-search">
			<Icon name="search" size={15} />
			<input aria-label="Search projects" placeholder="Search projects — name, code, client…" bind:value={query} use:autofocus onkeydown={onKey} />
			<span class="op-kbd">Esc</span>
		</div>
	{/snippet}
		<div class="op-list">
			{#if loadError}
				<div class="op-empty">{loadError}</div>
			{:else if loading}
				<div class="op-empty">Loading projects…</div>
			{:else}
				{#each results as p, i (p.id)}
					<!-- svelte-ignore a11y_mouse_events_have_key_events -->
					<button class="op-item" class:sel={i === sel} class:current={p.id === currentId} onmousemove={() => (sel = i)} onclick={() => choose(p)}>
						<Icon name="folder" size={14} />
						<span class="op-name">{p.name || p.id}</span>
						{#if p.projectCode || p.clientCode}<span class="op-code">{[p.clientCode, p.projectCode].filter(Boolean).join(' · ')}</span>{/if}
						{#if p.id === currentId}<span class="op-here">open</span>{/if}
						<span class="op-date">{formatDate(p.updatedAt ?? p.createdAt, cfg?.locale ?? 'ja')}</span>
					</button>
				{/each}
				{#if !results.length}<div class="op-empty">{query.trim() || mine ? 'No projects match' : 'No projects'}</div>{/if}
			{/if}
		</div>
</CadDialog>

<style>
	.op-mine { display:inline-flex; align-items:center; gap:5px; margin-left:12px; font-size:11px; color:var(--cad-muted); cursor:pointer; }
	.op-mine input { accent-color:#2563eb; }
	.op-search { flex:1; display:flex; align-items:center; gap:9px; }
	.op-search :global(svg) { color:var(--cad-muted); flex:0 0 auto; }
	.op-search input { flex:1; min-width:0; background:none; border:none; color:var(--cad-text); font-size:14px; }
	.op-search input:focus { outline:none; }
	.op-kbd { font-size:10px; color:var(--cad-faint); border:1px solid var(--cad-line); border-radius:4px; padding:1px 5px; }
	.op-list { max-height:56vh; overflow-y:auto; padding:5px; }
	.op-item { display:flex; align-items:center; gap:9px; width:100%; padding:8px 10px; border-radius:6px; background:none; border:none; color:var(--cad-text); text-align:left; cursor:pointer; }
	.op-item.sel { background:var(--cad-sel); }
	.op-item :global(svg) { color:var(--cad-muted); flex:0 0 auto; }
	.op-item.sel :global(svg) { color:#2563eb; }
	.op-name { flex:1; min-width:0; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
	.op-item.current .op-name { font-weight:700; }
	.op-code { font-size:11px; color:var(--cad-muted); flex:0 0 auto; font-family:Consolas,monospace; }
	.op-here { font-size:10px; color:#2563eb; border:1px solid #2563eb; border-radius:4px; padding:0 5px; flex:0 0 auto; }
	.op-date { font-size:11px; color:var(--cad-faint); flex:0 0 auto; min-width:78px; text-align:right; }
	.op-empty { padding:16px; text-align:center; font-size:12px; color:var(--cad-faint); }
</style>
