<script lang="ts">
	import { Window, Icon } from '$lib'
	import { portal } from '../edit/portal'
	import type { Firestore } from '$lib/db.svelte'
	import type { SheetDoc, SheetRevision } from '../types'
	import { updateSheet } from '../data'

	let { sheet, db, pid }: { sheet: SheetDoc; db: Firestore; pid: string } = $props()

	let revs = $derived<SheetRevision[]>(sheet.revisions ?? [])
	let current = $derived(sheet.currentRevision ?? '')

	function save(revisions: SheetRevision[], currentRevision = current) {
		if (!sheet?.id) return
		updateSheet(db, pid, sheet.id, { revisions, currentRevision })
	}
	const nextCode = () => {
		const last = revs[revs.length - 1]?.code
		if (last && /^[A-Z]$/.test(last)) return String.fromCharCode(last.charCodeAt(0) + 1)
		return String.fromCharCode(65 + revs.length) // A, B, …
	}
	function add() {
		const code = nextCode()
		save([...revs, { code, date: new Date().toISOString().slice(0, 10), note: '' }], code)
	}
	function patch(i: number, p: Partial<SheetRevision>) {
		save(revs.map((r, idx) => idx === i ? { ...r, ...p } : r))
	}
	function remove(i: number) {
		const next = revs.filter((_, idx) => idx !== i)
		save(next, next.some(r => r.code === current) ? current : (next[next.length - 1]?.code ?? ''))
	}
	const val = (e: Event) => (e.currentTarget as HTMLInputElement).value
</script>

<div use:portal>
<Window title="Revisions" name="sheet-revisions" right={10} top={360} open class="w-[20rem] space-y-1 p-2 text-zinc-700">
	{#each revs as r, i (i)}
		<div class="flex items-center gap-1 text-xs">
			<input type="radio" name="cur-rev" checked={current === r.code} onchange={() => save(revs, r.code)} title="Current Revision" />
			<input class="w-10 rounded border px-1 py-0.5 font-mono" value={r.code} oninput={(e) => patch(i, { code: val(e) })} />
			<input type="date" class="rounded border px-1 py-0.5" value={r.date ?? ''} oninput={(e) => patch(i, { date: val(e) })} />
			<input class="min-w-0 flex-1 rounded border px-1 py-0.5" placeholder="note" value={r.note ?? ''} oninput={(e) => patch(i, { note: val(e) })} />
			<button class="text-red-500" title="Delete" onclick={() => remove(i)}><Icon name="trash" size={12} /></button>
		</div>
	{/each}
	{#if revs.length === 0}<p class="text-xs text-zinc-400">No revisions yet.</p>{/if}
	<button class="w-full rounded border px-1 py-0.5 text-xs hover:bg-slate-100" onclick={add}>+ Add revision</button>
</Window>
</div>
