<script lang="ts">
	import { tick } from 'svelte'
	import type { Annotation } from '$lib/types/pages'

	/**
	 * Renders page annotations (text in v1) inside the paper coordinate space
	 * (1px = 1mm at zoom 1, like viewports + title block). Each annotation can be
	 * selected, dragged (4px anti-nudge threshold), and double-clicked to edit
	 * its text inline. Font size is converted pt → mm so it prints at true point
	 * size. Selection outline is `print:outline-none` so it never hits the PDF.
	 */
	let { annotations, selectedId, pxPerMm, onselect, onupdate }: {
		annotations: Annotation[]
		selectedId: string | null
		/** Canvas zoom (px per mm) — converts drag deltas to mm. */
		pxPerMm: number
		onselect: (id: string) => void
		onupdate: (id: string, patch: Partial<Annotation>) => void
	} = $props()

	const THRESHOLD = 4
	const PT_TO_MM = 25.4 / 72 // 1pt in mm — paper px == mm, so this is the px font size
	let drag = $state<{ id: string; mx: number; my: number; sx: number; sy: number; moved: boolean } | null>(null)
	let editingId = $state<string | null>(null)

	function onDown(e: MouseEvent, a: Annotation) {
		if (e.button !== 0 || editingId === a.id) return
		e.stopPropagation() // don't let the canvas place/deselect
		onselect(a.id)
		drag = { id: a.id, mx: e.clientX, my: e.clientY, sx: a.positionMm.x, sy: a.positionMm.y, moved: false }
		window.addEventListener('mousemove', onMove)
		window.addEventListener('mouseup', onUp)
	}
	function onMove(e: MouseEvent) {
		const d = drag
		if (!d) return
		if (!d.moved) {
			if (Math.hypot(e.clientX - d.mx, e.clientY - d.my) < THRESHOLD) return
			d.moved = true
		}
		const dx = (e.clientX - d.mx) / pxPerMm
		const dy = (e.clientY - d.my) / pxPerMm
		onupdate(d.id, { positionMm: { x: d.sx + dx, y: d.sy + dy } })
	}
	function onUp() {
		drag = null
		window.removeEventListener('mousemove', onMove)
		window.removeEventListener('mouseup', onUp)
	}
	async function startEdit(e: MouseEvent, a: Annotation) {
		e.stopPropagation()
		const el = e.currentTarget as HTMLElement
		editingId = a.id
		await tick() // wait for contenteditable to apply, then focus + select all
		el.focus()
		const r = document.createRange()
		r.selectNodeContents(el)
		const sel = getSelection()
		sel?.removeAllRanges()
		sel?.addRange(r)
	}
	function endEdit(e: FocusEvent, a: Annotation) {
		const txt = (e.currentTarget as HTMLElement).innerText.replace(/\n$/, '')
		editingId = null
		if (txt !== (a.text ?? '')) onupdate(a.id, { text: txt })
	}
</script>

{#each annotations as a (a.id)}
	{#if a.kind === 'text'}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="absolute whitespace-pre leading-tight outline-offset-1 {selectedId === a.id ? 'outline-1 outline-blue-500 print:outline-none' : ''}"
			style:left="{a.positionMm.x}px"
			style:top="{a.positionMm.y}px"
			style:font-size="{(a.fontPt ?? 10) * PT_TO_MM}px"
			style:color={a.color ?? '#111827'}
			style:cursor={editingId === a.id ? 'text' : 'move'}
			contenteditable={editingId === a.id}
			onmousedown={e => onDown(e, a)}
			ondblclick={e => startEdit(e, a)}
			onblur={e => endEdit(e, a)}
		>{a.text ?? ''}</div>
	{/if}
{/each}
