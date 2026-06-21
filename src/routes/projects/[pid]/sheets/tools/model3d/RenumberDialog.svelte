<script lang="ts">
	import { Dialog } from '$lib'
	import { toast } from 'svelte-sonner'
	import { AnnotationEditor } from '../../annotations/annotations.svelte'

	let { editor, open = $bindable(false) }: { editor: AnnotationEditor; open?: boolean } = $props()

	let start = $state(1)
	let step = $state(1)
	let format = $state('###')
	let mode = $state<'overwrite' | 'prefix' | 'suffix' | 'replace'>('overwrite')
	let order = $state<'index' | 'value' | 'xy' | 'yx'>('index')

	// The labelled items in the selection (outlets + text/callout) — what renumber will touch.
	const items = $derived(editor.selectedAnnList().filter((a) => a.symbol === 'outlet' || a.kind === 'text' || a.kind === 'callout'))
	const count = $derived(items.length)
	const fld = 'h-7 w-full rounded border border-zinc-300 px-1.5 text-sm'

	// Live preview of the first two labels, using the first selected item's current label as the
	// sample so prefix/suffix/replace read realistically.
	const preview = $derived.by(() => {
		const sample = (items[0]?.symbol === 'outlet' ? items[0]?.outlet?.label : items[0]?.text) || 'AB'
		const apply1 = (n: number) => {
			const tok = AnnotationEditor.numToken(format, n)
			if (mode === 'prefix') return tok + sample
			if (mode === 'suffix') return sample + tok
			if (mode === 'replace') { const h = sample.match(/#+/); return h ? sample.replace(/#+/, String(n).padStart(h[0].length, '0')) : sample + tok }
			return tok
		}
		return `${apply1(start)}, ${apply1(start + step)}, …`
	})

	function apply() {
		const n = editor.renumber({ start, step, format, mode, order })
		toast.success(`Renumbered ${n} item${n === 1 ? '' : 's'}`)
		open = false
	}
</script>

<Dialog title="Auto number" bind:open>
	<div class="grid grid-cols-2 gap-2 px-6 pb-3 text-xs">
		<p class="col-span-2 text-[11px] text-zinc-500">{count} labelled item{count === 1 ? '' : 's'} selected (outlets + text). Objects have no number.</p>
		<label class="text-zinc-500">Start
			<input type="number" class={fld} bind:value={start} /></label>
		<label class="text-zinc-500">Increment
			<input type="number" class={fld} bind:value={step} /></label>
		<label class="text-zinc-500">Number format
			<input class={fld} bind:value={format} placeholder="### or A-###" /></label>
		<label class="text-zinc-500">Apply
			<select class={fld} bind:value={mode}>
				<option value="overwrite">Overwrite label</option>
				<option value="prefix">Prefix to label</option>
				<option value="suffix">Suffix to label</option>
				<option value="replace">Fill # in label</option>
			</select></label>
		<p class="col-span-2 -mt-1 text-[11px] text-zinc-400"><code>#</code>s = the number; their count sets zero-padding. Preview: <span class="font-medium text-zinc-600">{preview}</span></p>
		<label class="col-span-2 text-zinc-500">Order
			<select class={fld} bind:value={order}>
				<option value="index">Selection order</option>
				<option value="value">By existing number</option>
				<option value="xy">Left→right, then top→bottom (X, Y)</option>
				<option value="yx">Top→bottom, then left→right (Y, X)</option>
			</select></label>
		<div class="col-span-2 flex justify-end gap-2 pt-1">
			<button class="rounded border px-3 py-1 hover:bg-slate-100" onclick={() => (open = false)}>Cancel</button>
			<button class="rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-500 disabled:opacity-40" disabled={!count} onclick={apply}>Apply</button>
		</div>
	</div>
</Dialog>
