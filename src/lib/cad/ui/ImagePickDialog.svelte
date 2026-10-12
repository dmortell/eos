<!-- Insert › Image… (backlog "Markup kinds" part 4): pick the picture — a file from this computer (uploaded to the
     project's file storage and listed in Uploads) or one already in Uploads (an image, or a PDF page) — then drag its box
     on a plan, an elevation / section (on its plane, at the work depth) or a sheet. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import { watchProjectImages, watchProjectPdfs, storeFile, type ImageFile, type PdfFile } from '../app/projectFiles'
	import { backdropClose, dialogFocus } from './backdrop'

	let { project, onpick, onclose }: { project: CadProject; onpick: (p: { fileId: string; page?: number; name: string }) => void; onclose: () => void } = $props()

	let images = $state<ImageFile[]>([]), pdfs = $state<PdfFile[]>([]), pages = $state<Record<string, number>>({})
	let busy = $state(false), err = $state(''), find = $state('')
	$effect(() => {
		const offs = [watchProjectImages(project.db, project.pid, (f) => (images = f)), watchProjectPdfs(project.db, project.pid, (f) => (pdfs = f))]
		return () => offs.forEach((off) => off())
	})
	const match = (name: string) => !find.trim() || name.toLowerCase().includes(find.trim().toLowerCase())

	/** From this computer: stored like the project's other files (Settings › Files), then picked. */
	async function upload(file: File | undefined) {
		if (!file) return
		busy = true; err = ''
		try {
			const r = await storeFile(project.db, project.pid, file, { storage: project.settings?.fileStorage, route: file.type === 'application/pdf' ? 'floorplanUploader' : 'imageUploader' })
			onpick({ fileId: r.id, name: file.name })
		} catch (e) { err = `Upload failed: ${(e as Error).message}` }
		finally { busy = false }
	}
</script>

<div class="backdrop" role="presentation" use:backdropClose={onclose}>
	<div class="dlg" role="dialog" use:dialogFocus aria-label="Image" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.key === 'Escape' && onclose()}>
		<div class="head"><b>Image <span class="hint">— pick it, then drag its box on a plan, an elevation or a sheet</span></b><button class="x" title="Close (Esc)" onclick={onclose}>✕</button></div>
		<div class="body">
			<label class="btn up" class:busy title="Upload a picture or a PDF from this computer to the project's files (Uploads), and place it">
				{busy ? 'Uploading…' : 'From this computer…'}
				<input type="file" accept="image/*,application/pdf" disabled={busy} onchange={(e) => upload(e.currentTarget.files?.[0])} hidden /></label>
			{#if err}<p class="text-red-600">{err}</p>{/if}
			<p class="sub">Or from Uploads <input class="inp" bind:value={find} placeholder="Find…" /></p>
			<div class="list">
				{#each images.filter((f) => match(f.name)) as f (f.id)}
					<button class="row" title="Place this picture" onclick={() => onpick({ fileId: f.id, name: f.name })}><img src={f.url} alt="" /><span>{f.name}</span></button>
				{/each}
				{#each pdfs.filter((f) => match(f.name)) as f (f.id)}
					<div class="row pdf"><span class="tag">PDF</span><span class="nm">{f.name}</span>
						{#if f.pageCount > 1}<label>page <input class="inp pg" type="number" min="1" max={f.pageCount} value={pages[f.id] ?? 1} onchange={(e) => (pages = { ...pages, [f.id]: Math.min(f.pageCount, Math.max(1, Number(e.currentTarget.value) || 1)) })} /> / {f.pageCount}</label>{/if}
						<button class="btn" title="Place this page as a picture" onclick={() => onpick({ fileId: f.id, page: pages[f.id] ?? 1, name: `${f.name} p${pages[f.id] ?? 1}` })}>Place</button></div>
				{/each}
				{#if !images.length && !pdfs.length}<p class="hint">No files in Uploads yet.</p>{/if}
			</div>
		</div>
	</div>
</div>

<style>
	.backdrop { position: fixed; inset: 0; z-index: 80; background: rgb(0 0 0 / 0.25); display: flex; align-items: flex-start; justify-content: center; padding-top: 8vh; }
	.dlg { width: min(30rem, 96vw); max-height: 80vh; display: flex; flex-direction: column; background: var(--cad-panel, white); color: var(--cad-text, #18181b); border: 1px solid var(--cad-line, #e4e4e7); border-radius: 8px; box-shadow: 0 8px 30px rgb(0 0 0 / 0.2); font-size: 12px; }
	.head { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--cad-line, #e4e4e7); }
	.hint { font-weight: 400; color: var(--cad-muted, #71717a); }
	.x { color: var(--cad-muted, #71717a); }
	.body { overflow: auto; padding: 8px 12px 12px; }
	.btn { border: 1px solid var(--cad-line); border-radius: 4px; padding: 1px 8px; background: var(--cad-input); color: var(--cad-text); cursor: pointer; }
	.btn:hover { background: var(--cad-hover); }
	.up { display: inline-block; }
	.busy { opacity: 0.6; }
	.sub { margin-top: 10px; display: flex; align-items: center; gap: 6px; color: var(--cad-muted); }
	.inp { border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 4px; background: var(--cad-input); color: var(--cad-text); }
	.pg { width: 3rem; }
	.list { margin-top: 4px; display: flex; flex-direction: column; gap: 2px; }
	.row { display: flex; align-items: center; gap: 8px; padding: 2px 4px; border-radius: 4px; text-align: left; }
	button.row:hover { background: var(--cad-hover); }
	.row img { width: 40px; height: 28px; object-fit: contain; background: #fff; border: 1px solid var(--cad-line); }
	.row .nm { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.tag { font-size: 10px; font-weight: 600; color: #b91c1c; background: #fee2e2; border-radius: 3px; padding: 0 4px; }
</style>
