<!-- Project › Backups… (ADR 0008 §3, §8): the project's stored backups — newest first or largest first, with their
     sizes and the total — and Back up now. Per backup: Restore… (the owner), Download, Rename, Delete (its maker or the
     owner); tick several to delete them at once. Deleting is final. -->
<script lang="ts">
	import { dialogFocus } from './backdrop'
	import { onSnapshot, orderBy, query } from 'firebase/firestore'
	import type { CadProject } from '../app/project.svelte'
	import type { ProjectFile } from '../persist/file'
	import PartsPicker from './PartsPicker.svelte'
	import { floorsOf, type Parts } from '../domain/backupParts'
	import { canRestore, canDeleteBackup } from '../domain/restorePlan'
	import { backupsCol, storeBackup, loadBackup, renameBackup, deleteBackups, gzipText, backupFileName, type BackupHead } from '../app/backups'
	import { download } from '../render/download'

	let { project, onclose, onrestore, say }: {
		project: CadProject; onclose: () => void; say: (msg: string) => void
		/** Restore this backup: the Restore dialog takes it from here (parts, compare, notice). */
		onrestore: (source: { file: ProjectFile; name: string }) => void
	} = $props()

	let heads = $state.raw<BackupHead[]>([]), loading = $state(true)
	$effect(() => onSnapshot(query(backupsCol(project), orderBy('at', 'desc')), (s) => { heads = s.docs.map((d) => d.data() as BackupHead); loading = false }))

	let sort = $state<'newest' | 'largest'>('newest')
	const list = $derived(sort === 'newest' ? heads : [...heads].sort((a, b) => b.bytes - a.bytes))
	const total = $derived(heads.reduce((n, h) => n + h.bytes, 0))
	const owner = $derived(canRestore(project.ownerId, project.user))
	const canDel = (h: BackupHead) => canDeleteBackup(h.by?.uid, project.ownerId, project.user)

	let busy = $state(''), error = $state('')
	async function run(label: string, fn: () => Promise<void>) {
		busy = label; error = ''
		try { await fn() } catch (e) { error = (e as Error).message ?? String(e) } finally { busy = '' }
	}

	// Back up now
	let making = $state(false), name = $state(''), note = $state(''), parts = $state<Parts>('all')
	const floors = $derived(floorsOf(project.index.byId.values()))
	const save = () => run('Backing up…', async () => {
		const h = await storeBackup(project, name, parts, { note })
		say(`Backed up ${h.name} (${h.count} items, ${size(h.bytes)})`)
		making = false; name = ''; note = ''
	})

	// rename in place
	let editing = $state(''), editName = $state(''), editNote = $state('')
	const startEdit = (h: BackupHead) => { editing = h.id; editName = h.name; editNote = h.note ?? '' }
	const saveEdit = () => run('Saving…', async () => { await renameBackup(project, editing, editName, editNote); editing = '' })

	// delete, with a confirm bar
	let ticked = $state<string[]>([]), confirm = $state<BackupHead[] | null>(null)
	const toggle = (id: string, on: boolean) => { ticked = on ? [...ticked, id] : ticked.filter((x) => x !== id) }
	const askDelete = (hs: BackupHead[]) => { confirm = hs.filter(canDel) }
	const doDelete = () => run('Deleting…', async () => {
		const hs = confirm ?? []
		await deleteBackups(project, hs)
		ticked = ticked.filter((id) => !hs.some((h) => h.id === id)); confirm = null
		say(`Deleted ${hs.length} backup${hs.length > 1 ? 's' : ''}`)
	})

	const restore = (h: BackupHead) => run('Loading…', async () => { onrestore({ file: await loadBackup(project, h), name: h.name }) })
	const fetchFile = (h: BackupHead) => run('Loading…', async () => {
		const blob = await gzipText(JSON.stringify(await loadBackup(project, h)))
		download(blob, backupFileName(project.name, h.name, new Date(h.at)), 'application/gzip')
	})

	const size = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} kB`)
	const when = (t: number) => new Date(t).toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
	const partsOf = (h: BackupHead) => (h.parts === 'all' ? 'Whole project' : h.parts.map((p) => p.name).join(' + '))
	const issueOf = (h: BackupHead) => { const i = h.issueId ? project.store.get(h.issueId) : undefined; return i?.type === 'issue' ? (i.number ? `Issue ${i.number}` : i.name) : '' }
	function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !busy) { e.preventDefault(); if (confirm) confirm = null; else if (editing) editing = ''; else onclose() } }
</script>

<svelte:window onkeydown={onKey} />
<div class="backdrop">
	<div class="dlg" role="dialog" use:dialogFocus tabindex="-1" aria-modal="true" aria-label="Backups">
		<div class="head">
			<b>Backups</b>
			<span class="hint">{heads.length} · {size(total)}</span>
			<button class="x" title="Close (Esc)" disabled={!!busy} onclick={onclose}>✕</button>
		</div>

		<section>
			{#if !making}
				<div class="row">
					<button class="btn pri" disabled={!!busy} onclick={() => (making = true)}>Back up now…</button>
					<span class="hint">A copy kept in the project, for restoring later (File › Download backup… saves one as a file)</span>
				</div>
			{:else}
				<div class="row"><input class="name" placeholder="Name (default: what it holds)" bind:value={name} /><input class="note" placeholder="Note" bind:value={note} /></div>
				<PartsPicker {floors} bind:parts />
				<div class="row">
					<button class="btn pri" disabled={(parts !== 'all' && !parts.length) || !!busy} onclick={save}>{busy || 'Back up'}</button>
					<button class="btn" disabled={!!busy} onclick={() => (making = false)}>Cancel</button>
					<span class="hint">Each backup is a full copy of what it holds: keep the ones you need, delete the rest.</span>
				</div>
			{/if}
		</section>

		{#if confirm}
			<section class="confirm">
				<span>Delete {confirm.length} backup{confirm.length > 1 ? 's' : ''} ({size(confirm.reduce((n, h) => n + h.bytes, 0))})? This can't be undone.</span>
				<button class="btn danger" disabled={!!busy} onclick={doDelete}>{busy || 'Delete'}</button>
				<button class="btn" disabled={!!busy} onclick={() => (confirm = null)}>Keep</button>
			</section>
		{/if}

		<section class="list">
			<div class="row">
				<span class="hint">Sort:</span>
				<label><input type="radio" bind:group={sort} value="newest" /> Newest</label>
				<label><input type="radio" bind:group={sort} value="largest" /> Largest</label>
				{#if ticked.length}<button class="btn" style="margin-left:auto" onclick={() => askDelete(heads.filter((h) => ticked.includes(h.id)))}>Delete {ticked.length} ticked…</button>{/if}
			</div>
			{#if loading}
				<div class="hint">Loading…</div>
			{:else if !heads.length}
				<div class="hint">No backups yet.</div>
			{:else}
				<table>
					<thead><tr><th></th><th>Name</th><th>Holds</th><th>When</th><th>By</th><th class="num">Items</th><th class="num">Size</th><th></th></tr></thead>
					<tbody>
						{#each list as h (h.id)}
							<tr>
								<td><input type="checkbox" disabled={!canDel(h)} title={canDel(h) ? '' : 'Only its maker or the project owner can delete it'} checked={ticked.includes(h.id)} onchange={(e) => toggle(h.id, e.currentTarget.checked)} /></td>
								<td class="nm">
									{#if editing === h.id}
										<input class="name" bind:value={editName} /><input class="note" placeholder="Note" bind:value={editNote} />
										<button class="btn" onclick={saveEdit}>Save</button>
									{:else}
										<b>{h.name}</b>{#if issueOf(h)}<span class="tag">{issueOf(h)}</span>{/if}
										{#if h.note}<div class="hint">{h.note}</div>{/if}
									{/if}
								</td>
								<td>{partsOf(h)}</td>
								<td class="nowrap">{when(h.at)}</td>
								<td>{h.by?.name}</td>
								<td class="num">{h.count}</td>
								<td class="num">{size(h.bytes)}</td>
								<td class="acts">
									<button class="lnk" disabled={!owner || !!busy} title={owner ? 'Put models back as they were in this backup' : 'Only the project owner can restore'} onclick={() => restore(h)}>Restore…</button>
									<button class="lnk" disabled={!!busy} title="Save it as a .eoscad file" onclick={() => fetchFile(h)}>Download</button>
									<button class="lnk" disabled={!!busy} onclick={() => startEdit(h)}>Rename</button>
									<button class="lnk del" disabled={!canDel(h) || !!busy} title={canDel(h) ? '' : 'Only its maker or the project owner can delete it'} onclick={() => askDelete([h])}>Delete</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</section>
		{#if error}<section><span class="err">{error}</span></section>{/if}
	</div>
</div>

<style>
	.backdrop { position: fixed; inset: 0; z-index: 50; background: rgb(0 0 0 / 0.25); display: flex; align-items: flex-start; justify-content: center; padding-top: 8vh; }
	.dlg { width: min(64rem, 96vw); max-height: 84vh; overflow: auto; background: var(--cad-panel, white); color: var(--cad-text, #18181b); border: 1px solid var(--cad-line, #e4e4e7); border-radius: 8px; box-shadow: 0 8px 30px rgb(0 0 0 / 0.2); font-size: 12px; }
	.head { display: flex; gap: 10px; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--cad-line, #e4e4e7); }
	.head .x { margin-left: auto; color: var(--cad-muted, #71717a); }
	section { padding: 8px 12px; border-bottom: 1px solid var(--cad-line, #e4e4e7); display: flex; flex-direction: column; gap: 6px; }
	section:last-child { border-bottom: none; }
	.confirm { flex-direction: row; align-items: center; gap: 10px; background: #fef2f2; color: #991b1b; }
	.row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
	.row label { display: inline-flex; gap: 4px; align-items: center; cursor: pointer; }
	.hint { color: var(--cad-muted, #71717a); font-weight: 400; }
	.err { color: #b91c1c; }
	input { accent-color: #2563eb; }
	input.name, input.note { border: 1px solid var(--cad-line, #d4d4d8); border-radius: 4px; padding: 1px 6px; background: var(--cad-input, white); color: inherit; }
	input.name { width: 16rem; }
	input.note { width: 20rem; }
	.btn { border: 1px solid var(--cad-line, #d4d4d8); border-radius: 4px; padding: 2px 10px; background: var(--cad-input, white); white-space: nowrap; }
	.btn.pri { background: #2563eb; border-color: #2563eb; color: white; }
	.btn.danger { background: #dc2626; border-color: #dc2626; color: white; }
	.btn:disabled, .lnk:disabled { opacity: 0.45; }
	table { border-collapse: collapse; width: 100%; }
	th { text-align: left; font-weight: 500; color: var(--cad-muted, #71717a); padding: 2px 6px; border-bottom: 1px solid var(--cad-line, #e4e4e7); }
	td { padding: 4px 6px; vertical-align: top; border-bottom: 1px solid var(--cad-line, #f4f4f5); }
	.num { text-align: right; font-variant-numeric: tabular-nums; }
	.nowrap { white-space: nowrap; }
	.nm { min-width: 12rem; }
	.tag { margin-left: 6px; font-size: 10px; color: #2563eb; border: 1px solid #2563eb; border-radius: 4px; padding: 0 4px; }
	.acts { white-space: nowrap; text-align: right; }
	.lnk { color: #2563eb; padding: 0 4px; }
	.lnk.del { color: #b91c1c; }
</style>
