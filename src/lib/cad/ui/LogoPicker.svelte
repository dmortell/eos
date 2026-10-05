<!-- Pick a logo from the project's Uploads (backlog "Logos picked from Uploads"): its images to click, or "Upload…" a
     new one (it goes into the project's Uploads too, and is picked). -->
<script lang="ts">
	import { backdropClose } from './backdrop'
	import type { Firestore } from 'firebase/firestore'
	import { watchProjectImages, type ImageFile } from '../app/projectFiles'

	let { db, pid, title, onpick, onupload, onclose }: {
		db: Firestore; pid: string; title: string
		onpick: (f: ImageFile) => void; onupload: (file: File) => void; onclose: () => void
	} = $props()

	let files = $state<ImageFile[] | null>(null)
	$effect(() => watchProjectImages(db, pid, (f) => { files = f }))
	function upload(e: Event) {
		const input = e.currentTarget as HTMLInputElement, f = input.files?.[0]
		input.value = ''
		if (f) { onupload(f); onclose() }
	}
</script>

<div class="backdrop" role="presentation" use:backdropClose={onclose}>
	<div class="dlg" role="dialog" aria-label={title} tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.key === 'Escape' && onclose()}>
		<div class="head"><b>{title}</b><button class="x" title="Close (Esc)" onclick={onclose}>✕</button></div>
		<div class="grid">
			{#if files === null}<p class="hint">Loading…</p>
			{:else}
				{#each files as f (f.id)}
					<button class="img" title={f.name} onclick={() => { onpick(f); onclose() }}><img src={f.url} alt={f.name} /><span>{f.name}</span></button>
				{:else}
					<p class="hint">No images in this project's Uploads yet.</p>
				{/each}
			{/if}
		</div>
		<div class="foot">
			<label class="btn">Upload…<input type="file" accept="image/*" onchange={upload} /></label>
			<span class="hint">a new image goes into the project's Uploads and is used here</span>
		</div>
	</div>
</div>

<style>
	.backdrop { position: fixed; inset: 0; z-index: 50; background: rgb(0 0 0 / 0.25); display: flex; align-items: flex-start; justify-content: center; padding-top: 8vh; }
	.dlg { width: min(36rem, 94vw); max-height: 80vh; display: flex; flex-direction: column; background: var(--cad-panel, white); color: var(--cad-text, #18181b); border: 1px solid var(--cad-line, #e4e4e7); border-radius: 8px; box-shadow: 0 8px 30px rgb(0 0 0 / 0.2); font-size: 12px; }
	.head, .foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 12px; }
	.head { border-bottom: 1px solid var(--cad-line, #e4e4e7); }
	.foot { border-top: 1px solid var(--cad-line, #e4e4e7); justify-content: flex-start; }
	.x { color: var(--cad-muted, #71717a); }
	.grid { overflow: auto; padding: 10px 12px; display: grid; grid-template-columns: repeat(auto-fill, minmax(7.5rem, 1fr)); gap: 8px; }
	.img { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 6px; border: 1px solid var(--cad-line, #e4e4e7); border-radius: 6px; background: white; }
	.img:hover { border-color: #2563eb; }
	.img img { width: 100%; height: 4rem; object-fit: contain; }
	.img span { width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: #3f3f46; }
	.hint { color: var(--cad-muted, #71717a); }
	.btn { border: 1px solid var(--cad-line, #d4d4d8); border-radius: 4px; padding: 2px 10px; background: var(--cad-input, white); cursor: pointer; }
	.btn input { display: none; }
</style>
