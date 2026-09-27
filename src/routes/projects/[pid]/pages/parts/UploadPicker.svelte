<script lang="ts">
	// Pick an uploaded PDF (+ page) or picture from the Uploads tool — this project's files first, then other
	// projects'. Used by Properties › IMAGE › Replace… and Insert › From Uploads… (ui/pdfFiles.ts does the work).
	import { page } from '$app/state'
	import { listUploadFiles, type UploadFile } from '../ui/pdfFiles'

	let { current = null, busy = false, action = 'Replace', onpick, oncancel }: {
		/** The file / page shown now (preselected). */ current?: { fileId: string; page: number } | null
		busy?: boolean; action?: string
		onpick: (f: UploadFile, page: number) => void; oncancel: () => void
	} = $props()
	let files = $state<UploadFile[] | null>(null)
	// svelte-ignore state_referenced_locally
	let fileId = $state(current?.fileId ?? ''), pg = $state(current?.page ?? 1)
	$effect(() => { listUploadFiles(page.params.pid ?? '').then((fs) => { files = fs; if (!fileId || !fs.some((f) => f.id === fileId)) fileId = fs[0]?.id ?? '' }).catch(() => { files = [] }) })
	const groups = $derived.by(() => {
		const by = new Map<string, UploadFile[]>()
		for (const f of files ?? []) { const k = f.mine ? 'This project' : f.projectName; by.set(k, [...(by.get(k) ?? []), f]) }
		return [...by]
	})
	const sel = $derived(files?.find((f) => f.id === fileId))
</script>

<div class="up-pick">
	{#if !files}<em>Loading uploads…</em>
	{:else if !files.length}<em>No PDFs or pictures in Uploads yet — upload them in the Uploads tool.</em>
	{:else}
		<select bind:value={fileId} onchange={() => (pg = 1)}>
			{#each groups as [proj, fs] (proj)}
				<optgroup label={proj}>{#each fs as f (f.id)}<option value={f.id}>{f.kind === 'pdf' ? '📄' : '🖼'} {f.name}</option>{/each}</optgroup>
			{/each}
		</select>
		{#if sel?.kind === 'pdf' && sel.pages > 1}
			<select bind:value={pg}>{#each Array.from({ length: sel.pages }, (_, i) => i + 1) as n (n)}<option value={n}>Page {n}</option>{/each}</select>
		{/if}
		<span class="up-btns">
			<button disabled={!sel || busy} onclick={() => sel && onpick(sel, pg)}>{busy ? 'Placing…' : action}</button>
			<button onclick={oncancel}>Cancel</button>
		</span>
		<em>Placed by its calibration in the Uploads tool (else at this size). Another project's file is only referenced.</em>
	{/if}
</div>

<style>
	.up-pick { display:flex; flex-direction:column; gap:4px; margin:2px 6px 6px; padding:6px; border:1px solid var(--line); border-radius:6px; background:var(--panel2); }
	.up-pick select { width:100%; background:var(--input); color:var(--text); border:1px solid var(--line); border-radius:4px; font-size:11px; padding:3px 4px; }
	.up-btns { display:flex; gap:4px; }
	.up-btns button { font-size:10px; padding:2px 7px; border-radius:4px; color:var(--text); background:var(--input); border:1px solid var(--line); cursor:pointer; }
	.up-btns button:hover:not(:disabled) { border-color:var(--accent); }
	.up-btns button:disabled { opacity:.5; }
	em { font-style:normal; font-size:10px; color:var(--faint); }
</style>
