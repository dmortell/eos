<!-- Pick a logo from the project's Uploads (backlog "Logos picked from Uploads"): its images to click, or "Upload…" a
     new one (it goes into the project's Uploads too, and is picked). -->
<script lang="ts">
	import CadDialog from './CadDialog.svelte'
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

<CadDialog {title} width="36rem" top="8vh" {onclose}>
		{#snippet footer()}
			<label class="btn">Upload…<input type="file" accept="image/*" onchange={upload} /></label>
			<span class="hint">a new image goes into the project's Uploads and is used here</span>
			<span class="grow"></span>
		{/snippet}
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
</CadDialog>

<style>
	.grow { flex: 1; }
	.grid { padding: 2px 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(7.5rem, 1fr)); gap: 8px; }
	.img { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 6px; border: 1px solid var(--cad-line, #e4e4e7); border-radius: 6px; background: white; }
	.img:hover { border-color: #2563eb; }
	.img img { width: 100%; height: 4rem; object-fit: contain; }
	.img span { width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: #3f3f46; }
	.hint { color: var(--cad-muted, #71717a); }
	.btn { border: 1px solid var(--cad-line, #d4d4d8); border-radius: 4px; padding: 2px 10px; background: var(--cad-input, white); cursor: pointer; }
	.btn input { display: none; }
</style>
