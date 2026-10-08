<!-- File › Download backup… and File › Restore from file… (ADR 0008 §5). Download: pick the parts, save a .eoscad
     file. Restore: open a file from this project, pick which of its parts, preview what changes, restore as ONE undo
     step — the project owner only (§4). -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import PartsPicker from './PartsPicker.svelte'
	import { floorsOf, partsLabel, type Parts } from '../domain/backupParts'
	import { canRestore } from '../domain/restorePlan'
	import { readProjectFile, type ProjectFile } from '../persist/file'
	import { collect, previewRestore, applyRestore, gzipText, readBackupFile, backupFileName, checkFile, type RestorePreview } from '../app/backups'
	import { download } from '../render/download'

	let { project, mode, onclose, say }: { project: CadProject; mode: 'download' | 'restore'; onclose: () => void; say: (msg: string) => void } = $props()

	let parts = $state<Parts>('all')
	let busy = $state(''), error = $state('')
	let file = $state.raw<ProjectFile | null>(null), fileName = $state(''), fileWarnings = $state<string[]>([])
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

	const doRestore = () => run('Restoring…', async () => {
		if (backFirst) await saveFile(parts, 'Before restore - ')
		const p = await applyRestore(project, file!, parts, fileName.replace(/\.eoscad$/i, ''))
		say(`Restored — ${p.line}${p.skipped.length ? ` (${p.skipped.length} skipped)` : ''}. Ctrl+Z undoes it.`)
		onclose()
	})

	const when = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? iso : d.toLocaleString() }
	function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !busy) { e.preventDefault(); onclose() } }
</script>

<svelte:window onkeydown={onKey} />
<div class="backdrop">
	<div class="dlg" role="dialog" aria-modal="true" aria-label={mode === 'download' ? 'Download backup' : 'Restore from file'}>
		<div class="head"><b>{mode === 'download' ? 'Download backup' : 'Restore from file'}</b><button class="x" title="Close (Esc)" disabled={!!busy} onclick={onclose}>✕</button></div>

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
					<button class="btn" disabled={!!busy} onclick={() => input?.click()}>{file ? 'Choose another file…' : 'Choose a backup file…'}</button>
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
						<div class="hint">Everyone working in these models gets the change at once. Issues and sheet revisions stay as they are.</div>
						<label class="row"><input type="checkbox" bind:checked={backFirst} /> Download the current state first</label>
					{:else}
						<div class="hint">Compare first, to see what the restore would change.</div>
					{/if}
				</section>
				<section class="foot">
					{#if !owner}<span class="warn">Only the project owner can restore this project.</span>{:else if !project.ownerId}<span class="hint">This project has no owner set, so anyone who can edit may restore it.</span>{:else}<span></span>{/if}
					{#if !preview}
						<button class="btn pri" disabled={none || !!busy} onclick={doPreview}>{busy || 'Compare'}</button>
					{:else}
						{@const empty = !preview.plan.put.length && !preview.plan.del.length}
						<button class="btn pri" disabled={!owner || empty || !!busy} title={!owner ? 'Only the project owner can restore' : empty ? 'Nothing to change' : ''} onclick={doRestore}>{busy || 'Restore'}</button>
					{/if}
				</section>
			{/if}
		{/if}
		{#if error}<section><span class="err">{error}</span></section>{/if}
	</div>
</div>

<style>
	.backdrop { position: fixed; inset: 0; z-index: 50; background: rgb(0 0 0 / 0.25); display: flex; align-items: flex-start; justify-content: center; padding-top: 10vh; }
	.dlg { width: min(34rem, 96vw); max-height: 80vh; overflow: auto; background: var(--cad-panel, white); color: var(--cad-text, #18181b); border: 1px solid var(--cad-line, #e4e4e7); border-radius: 8px; box-shadow: 0 8px 30px rgb(0 0 0 / 0.2); font-size: 12px; }
	.head { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--cad-line, #e4e4e7); }
	.x { color: var(--cad-muted, #71717a); }
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
