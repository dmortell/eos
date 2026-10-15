<!-- File › Download backup… and File › Restore from file… (ADR 0008 §5). Download: pick the parts, save a .eoscad
     file. Restore: open a file from this project, pick which of its parts, preview what changes, restore as ONE undo
     step — the project owner only (§4). -->
<script lang="ts">
	import CadDialog from './CadDialog.svelte'
	import type { CadProject } from '../app/project.svelte'
	import PartsPicker from './PartsPicker.svelte'
	import { floorsOf, partsLabel, type Parts } from '../domain/backupParts'
	import { canRestore } from '../domain/restorePlan'
	import { readProjectFile, type ProjectFile } from '../persist/file'
	import { collect, previewRestore, applyRestore, gzipText, readBackupFile, backupFileName, checkFile, storeBackup, type RestorePreview } from '../app/backups'
	import { download } from '../render/download'

	/** `source`: restore a stored backup (Project › Backups…) instead of choosing a file. */
	let { project, mode, source, onclose, say }: { project: CadProject; mode: 'download' | 'restore'; source?: { file: ProjectFile; name: string }; onclose: () => void; say: (msg: string) => void } = $props()

	// svelte-ignore state_referenced_locally
	let parts = $state<Parts>(source?.file.parts ?? 'all')
	let busy = $state(''), error = $state('')
	// svelte-ignore state_referenced_locally
	let file = $state.raw<ProjectFile | null>(source?.file ?? null), fileName = $state(source?.name ?? ''), fileWarnings = $state<string[]>([])
	let preview = $state.raw<RestorePreview | null>(null)
	let backFirst = $state(true)
	let input: HTMLInputElement | undefined = $state()

	const floors = $derived(mode === 'download' ? floorsOf(project.index.byId.values()) : file ? floorsOf(file.entities) : [])
	const none = $derived(parts !== 'all' && !parts.length)
	const owner = $derived(canRestore(project.ownerId, project.user))
	$effect(() => { void parts; preview = null })   // a different choice needs a new preview

	const mb = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} kB`)

	/** Collect `which` and save it as a file; returns its name. */
	async function saveFile(which: Parts, prefix = ''): Promise<string> {
		const f = await collect(project, which)
		const blob = await gzipText(JSON.stringify(f))
		const name = prefix + backupFileName(project.name, partsLabel(project.index.byId.values(), which))
		download(blob, name, 'application/gzip')
		return `${name} (${f.entities.length} items, ${mb(blob.size)})`
	}

	async function run(label: string, fn: () => Promise<void>) {
		busy = label; error = ''
		try { await fn() } catch (e) { error = (e as Error).message ?? String(e) } finally { busy = '' }
	}

	const doDownload = () => run('Collecting…', async () => { say(`Downloaded ${await saveFile(parts)}`); onclose() })

	async function pick(e: Event) {
		const f = (e.currentTarget as HTMLInputElement).files?.[0]
		if (!f) return
		await run('Reading…', async () => {
			file = null; preview = null
			const r = readProjectFile(await readBackupFile(f))
			if (r.error || !r.file) throw new Error(r.error ?? 'Not a backup')
			checkFile(project, r.file)
			file = r.file; fileName = f.name; fileWarnings = r.issues.filter((i) => i.severity === 'error').map((i) => i.message)
			parts = r.file.parts ?? 'all'
		})
	}

	const doPreview = () => run('Comparing…', async () => { preview = await previewRestore(project, file!, parts) })

	/** The countdown everyone else sees (ADR 0008 §6): announce, wait 30 s (Cancel stops it), then everyone else is
	 *  read-only while it runs, and told when it's done. */
	let noticeId = $state(''), now = $state(Date.now())
	const left = $derived.by(() => { const n = project.notices.notice; return n?.id === noticeId ? Math.max(0, Math.ceil((n.startsAt - now) / 1000)) : 0 })
	$effect(() => { if (!noticeId) return; const t = setInterval(() => (now = Date.now()), 250); return () => clearInterval(t) })

	const doRestore = () => run('Restoring…', async () => {
		const what = fileName.replace(/\.eoscad$/i, ''), notices = project.notices
		let id = ''
		try {
			id = noticeId = await notices.announce(what, partsLabel(file!.entities, parts))
			await notices.countdown(id)
			await notices.start(id)
			if (backFirst) await storeBackup(project, `Before restore — ${what}`, parts)
			const p = await applyRestore(project, file!, parts, what)
			const line = `${p.line}${p.skipped.length ? ` (${p.skipped.length} skipped)` : ''}`
			await notices.finish(id, line)
			say(`Restored — ${line}. Ctrl+Z undoes it.`)
			onclose()
		} catch (e) {
			if (id) await notices.cancel(id, (e as Error).message)
			throw e
		} finally { noticeId = '' }
	})

	const title = $derived(mode === 'download' ? 'Download backup' : source ? 'Restore backup' : 'Restore from file')
	const when = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? iso : d.toLocaleString() }
</script>

<!-- a click beside it doesn't close it (a chosen file and its comparison would be lost); nor does anything while a job runs -->
<CadDialog {title} width="34rem" top="10vh" flush outside={false} locked={!!busy} {onclose}>

		{#if mode === 'download'}
			<section>
				<div class="h">What to back up</div>
				<PartsPicker {floors} bind:parts />
			</section>
			<section class="foot">
				<span class="hint">Saved as a compressed .eoscad file. Restore it with File › Restore from file…</span>
				<button class="btn pri" disabled={none || !!busy} onclick={doDownload}>{busy || 'Download'}</button>
			</section>
		{:else}
			<section>
				<div class="row">
					{#if !source}<button class="btn" disabled={!!busy} onclick={() => input?.click()}>{file ? 'Choose another file…' : 'Choose a backup file…'}</button>{/if}
					<input bind:this={input} type="file" accept=".eoscad,.json" hidden onchange={pick} />
					{#if file}<span class="fname">{fileName}</span>{/if}
				</div>
				{#if file}
					<div class="hint">From <b>{file.project?.name || 'this project'}</b> · {when(file.exportedAt)}{file.by?.name ? ` · by ${file.by.name}` : ''} · {partsLabel(file.entities, file.parts ?? 'all')} · {file.entities.length} items</div>
					{#if fileWarnings.length}<div class="hint">The data was saved with {fileWarnings.length} problem{fileWarnings.length > 1 ? 's' : ''} it had then (e.g. {fileWarnings[0]}); a restore brings {fileWarnings.length > 1 ? 'them' : 'it'} back as {fileWarnings.length > 1 ? 'they were' : 'it was'}.</div>{/if}
				{/if}
			</section>
			{#if file}
				<section>
					<div class="h">What to restore</div>
					<PartsPicker {floors} bind:parts allowAll={(file.parts ?? 'all') === 'all'} />
				</section>
				<section>
					{#if preview}
						<div class="h">{preview.line}</div>
						{#each preview.skipped.slice(0, 8) as s (s)}<div class="warn">{s}</div>{/each}
						{#if preview.skipped.length > 8}<div class="warn">… and {preview.skipped.length - 8} more skipped</div>{/if}
						<div class="hint">Everyone working in these models gets the change at once. Releases and sheet revisions stay as they are.</div>
						<label class="row"><input type="checkbox" bind:checked={backFirst} /> Back up the current state first <span class="hint">(Project › Backups…)</span></label>
					{:else}
						<div class="hint">Compare first, to see what the restore would change.</div>
					{/if}
				</section>
				<section class="foot">
					{#if !owner}<span class="warn">Only the project owner can restore this project.</span>{:else if !project.ownerId}<span class="hint">This project has no owner set, so anyone who can edit may restore it.</span>{:else}<span></span>{/if}
					{#if !preview}
						<button class="btn pri" disabled={none || !!busy} onclick={doPreview}>{busy || 'Compare'}</button>
					{:else if noticeId}
						<span class="warn">{left ? `Restoring in ${left} s — everyone in the project has been told` : 'Restoring — everyone else is read-only until it\'s done'}</span>
						{#if left}<button class="btn" onclick={() => project.notices.cancel(noticeId)}>Cancel</button>{/if}
					{:else}
						{@const empty = !preview.plan.put.length && !preview.plan.del.length}
						<button class="btn pri" disabled={!owner || empty || !!busy} title={!owner ? 'Only the project owner can restore' : empty ? 'Nothing to change' : ''} onclick={doRestore}>{busy || 'Restore'}</button>
					{/if}
				</section>
			{/if}
		{/if}
		{#if error}<section><span class="err">{error}</span></section>{/if}
</CadDialog>

<style>
	section { padding: 8px 12px; border-bottom: 1px solid var(--cad-line, #e4e4e7); display: flex; flex-direction: column; gap: 6px; }
	section:last-child { border-bottom: none; }
	.foot { flex-direction: row; justify-content: space-between; align-items: center; gap: 10px; }
	.h { font-weight: 600; }
	.hint { color: var(--cad-muted, #71717a); }
	.warn { color: #b45309; }
	.err { color: #b91c1c; }
	.row { display: flex; gap: 8px; align-items: center; }
	.row input { accent-color: #2563eb; }
	.fname { font-family: ui-monospace, monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.btn { border: 1px solid var(--cad-line, #d4d4d8); border-radius: 4px; padding: 2px 10px; background: var(--cad-input, white); white-space: nowrap; }
	.btn.pri { background: #2563eb; border-color: #2563eb; color: white; }
	.btn:disabled { opacity: 0.5; }
</style>
