<script lang="ts">
	// Ctrl+K destination palette (kestrel-adoption.md B2): jump to any sheet,
	// tool, floorplan floor, or project without going back through the menus.
	// Mounted once in the root layout; items are (re)fetched on open.
	// Styled after Kestrel CAD's palette — a dark glass panel that works over
	// every app theme.
	import { goto } from '$app/navigation'
	import { page } from '$app/state'
	import { Icon } from '$lib'
	import type { Firestore } from '$lib/db.svelte'
	import { palette } from './palette.svelte'

	let { db }: { db: Firestore } = $props()

	type Item = { icon: string; label: string; kind: string; url: string; keywords?: string }

	let query = $state('')
	let index = $state(0)
	let items = $state<Item[]>([])
	let loading = $state(false)
	let inputEl: HTMLInputElement | undefined = $state()
	let listEl: HTMLDivElement | undefined = $state()

	// Tool switches keep the floor/area/room context, same as the Titlebar menu.
	function ctxQs(): string {
		const sp = page.url.searchParams
		const out = new URLSearchParams()
		for (const key of ['floor', 'area', 'room', 'row', 'rack']) {
			const v = sp.get(key)
			if (v != null) out.set(key, v)
		}
		const qs = out.toString()
		return qs ? `?${qs}` : ''
	}

	const TOOLS: { label: string; href: string; icon: string }[] = [
		{ label: 'Sheets', href: 'sheets', icon: 'fileText' },
		{ label: 'Floorplans', href: 'outlets', icon: 'mapPin' },
		{ label: 'Elevations', href: 'elevations', icon: 'server' },
		{ label: 'Patching', href: 'elevations/patching', icon: 'cable' },
		{ label: 'Racks', href: 'racks', icon: 'rows' },
		{ label: 'Frames', href: 'frames', icon: 'grid' },
		{ label: 'Uploads', href: 'uploads', icon: 'upload' },
	]

	async function build() {
		loading = true
		const pid = page.params.pid
		const out: Item[] = []
		const qs = ctxQs()
		if (pid) {
			for (const t of TOOLS) out.push({ icon: t.icon, label: t.label, kind: 'Tool', url: `/projects/${pid}/${t.href}${t.href.includes('sheets') || t.href.includes('uploads') ? '' : qs}` })
		}
		out.push({ icon: 'home', label: 'Projects home', kind: 'Nav', url: '/' })
		try {
			const [projects, sheets] = await Promise.all([
				db.getMany('projects'),
				pid ? db.getMany(`projects/${pid}/sheets`) : Promise.resolve([]),
			])
			const sorted = (sheets as any[]).filter(s => s.title !== undefined || s.paper !== undefined)
				.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
			for (const s of sorted) {
				out.push({ icon: 'fileText', label: `${s.drawingNumber ? s.drawingNumber + '  ' : ''}${s.title ?? 'Untitled'}`, kind: 'Sheet', url: `/projects/${pid}/sheets/${s.id}`, keywords: 'sheet drawing' })
			}
			const cur = pid ? (projects as any[]).find(p => p.id === pid) : null
			if (cur && Array.isArray(cur.floors)) {
				for (const f of cur.floors) {
					out.push({ icon: 'mapPin', label: `Floorplan ${f.number}F`, kind: 'Floor', url: `/projects/${pid}/outlets?floor=${f.number}`, keywords: `floor ${f.number}` })
				}
			}
			for (const p of (projects as any[])) {
				if (!p.name) continue
				out.push({ icon: 'folder', label: p.name, kind: 'Project', url: `/projects/${p.id}`, keywords: 'project' })
			}
		} catch { /* offline / rules — static tool items still work */ }
		items = out
		loading = false
	}

	let results = $derived.by(() => {
		const q = query.trim().toLowerCase()
		if (!q) return items
		const hay = (it: Item) => `${it.label} ${it.kind} ${it.keywords ?? ''}`.toLowerCase()
		const starts = items.filter(it => it.label.toLowerCase().startsWith(q))
		const rest = items.filter(it => !it.label.toLowerCase().startsWith(q) && hay(it).includes(q))
		return [...starts, ...rest]
	})
	$effect(() => { void results; index = 0 })

	function close() { palette.open = false; query = '' }
	function pick(it: Item) { close(); goto(it.url) }

	$effect(() => {
		if (palette.open) {
			build()
			setTimeout(() => inputEl?.focus(), 0)
		}
	})

	function onWindowKey(e: KeyboardEvent) {
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
			e.preventDefault()
			palette.open = !palette.open
		}
	}
	function onInputKey(e: KeyboardEvent) {
		if (e.key === 'Escape') { e.preventDefault(); close() }
		else if (e.key === 'ArrowDown') { e.preventDefault(); index = Math.min(index + 1, results.length - 1); scrollTo() }
		else if (e.key === 'ArrowUp') { e.preventDefault(); index = Math.max(index - 1, 0); scrollTo() }
		else if (e.key === 'Enter') { e.preventDefault(); const it = results[index]; if (it) pick(it) }
	}
	function scrollTo() {
		listEl?.children[index]?.scrollIntoView({ block: 'nearest' })
	}
</script>

<svelte:window onkeydown={onWindowKey} />

{#if palette.open}
	<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
	<div class="kpal-backdrop" onmousedown={(e) => { if (e.target === e.currentTarget) close() }}>
		<div class="kpal">
			<div class="kpal-input">
				<Icon name="search" size={15} />
				<input bind:this={inputEl} bind:value={query} onkeydown={onInputKey}
					placeholder="Go to sheet, tool, floor, project…" spellcheck="false" />
				<kbd>ESC</kbd>
			</div>
			<div class="kpal-results" bind:this={listEl}>
				{#each results as it, i (it.url + it.label)}
					<button class="kpal-row" class:active={i === index}
						onclick={() => pick(it)} onmousemove={() => (index = i)}>
						<Icon name={it.icon} size={14} />
						<span class="kpal-label">{it.label}</span>
						<span class="kpal-kind">{it.kind}</span>
					</button>
				{:else}
					<div class="kpal-empty">{loading ? 'Loading…' : 'No matches'}</div>
				{/each}
			</div>
			<div class="kpal-footer"><kbd>↑↓</kbd> navigate <span>·</span> <kbd>↵</kbd> open <span>·</span> <kbd>Ctrl K</kbd> toggle</div>
		</div>
	</div>
{/if}

<style>
	/* Kestrel palette look — fixed dark glass, independent of app theme. */
	.kpal-backdrop {
		position: fixed; inset: 0; z-index: 10000;
		background: #080e185e; backdrop-filter: blur(3px);
		display: flex; justify-content: center; align-items: flex-start;
	}
	.kpal {
		margin-top: 15vh; width: min(600px, calc(100vw - 32px));
		background: color-mix(in srgb, #1b2532 94%, transparent);
		border: 1px solid #344151; border-radius: 9px;
		box-shadow: 0 15px 40px #0007; color: #dce4ed;
		display: flex; flex-direction: column; overflow: hidden;
		font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
	}
	.kpal-input {
		display: flex; align-items: center; gap: 8px;
		padding: 10px 12px; border-bottom: 1px solid #2a3645; color: #8b9aab;
	}
	.kpal-input input {
		flex: 1; background: none; border: none; outline: none;
		color: #dce4ed; font-size: 13px;
	}
	.kpal-input input::placeholder { color: #63768b; }
	.kpal-results { max-height: 46vh; overflow-y: auto; padding: 4px; }
	.kpal-row {
		display: flex; align-items: center; gap: 9px; width: 100%;
		padding: 6px 9px; border: none; background: none; border-radius: 5px;
		color: #dce4ed; font-size: 12px; text-align: left; cursor: pointer;
	}
	.kpal-row :global(svg) { color: #8b9aab; flex-shrink: 0; }
	.kpal-row.active { background: #244852; }
	.kpal-row.active :global(svg) { color: #5ac6d2; }
	.kpal-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.kpal-kind {
		font-family: Consolas, monospace; font-size: 9px; text-transform: uppercase;
		letter-spacing: 0.06em; color: #63768b;
		border: 1px solid #2a3645; border-radius: 3px; padding: 1px 5px;
	}
	.kpal-empty { padding: 18px; text-align: center; color: #63768b; font-size: 12px; }
	.kpal-footer {
		display: flex; align-items: center; gap: 7px; padding: 7px 12px;
		border-top: 1px solid #2a3645; color: #63768b; font-size: 10px;
	}
	.kpal kbd {
		font-family: Consolas, monospace; font-size: 9px; color: #8b9aab;
		border: 1px solid #344151; border-radius: 3px; padding: 1px 4px; background: #17212e;
	}
</style>
