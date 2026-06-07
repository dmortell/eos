<script lang="ts">
	import { getContext } from 'svelte'
	import type { Firestore } from '$lib/db.svelte'
	import type { SheetViewport } from '../../types'
	import type { RiserDocData } from './types'
	import RisersRender from './RisersRender.svelte'
	import RisersEditLayer from './RisersEditLayer.svelte'
	import RisersEditPanel from './RisersEditPanel.svelte'
	import { RisersEditor } from './risers-editor.svelte'
	import { docSaver } from '../../edit/persist'

	let { vp, zoom = 1, active = false, view = null, onview, hidden = [], locked = [] }: {
		vp: SheetViewport
		zoom?: number
		active?: boolean
		view?: { x: number; y: number; w: number; h: number } | null
		onview?: (v: { x: number; y: number; w: number; h: number; den: number }) => void
		hidden?: string[]
		locked?: string[]
	} = $props()
	const db = getContext('db') as Firestore

	let src = $derived(vp.source.kind === 'risers' ? vp.source : null)
	let doc = $state<RiserDocData | null>(null)

	$effect(() => {
		const id = src?.risersDocId
		if (!id) { doc = null; return }
		const unsub = db.subscribeOne('risers', id, (d: any) => { doc = d ?? null })
		return () => unsub?.()
	})

	let fromFloor = $derived(src?.fromFloor ?? doc?.fromFloor ?? 1)
	let toFloor = $derived(src?.toFloor ?? doc?.toFloor ?? 1)

	// ── Editing ──
	const editor = new RisersEditor()
	$effect(() => { if (!active) editor.seed(doc) })
	$effect(() => {
		const id = src?.risersDocId
		if (!id) { editor.onChange = null; return }
		const saver = docSaver(db, 'risers', id)
		editor.onChange = () => saver.save(editor.snapshot())
		return () => { saver.flush(); editor.onChange = null }
	})
	$effect(() => {
		if (!active) return
		const onKey = (e: KeyboardEvent) => {
			const f = (e.target as Element)?.closest?.('input, textarea, select, [contenteditable]')
			if (e.key === 'Delete' && !f && editor.sel) { e.preventDefault(); e.stopPropagation(); editor.deleteSel() }
		}
		window.addEventListener('keydown', onKey, true)
		return () => window.removeEventListener('keydown', onKey, true)
	})
</script>

{#if src && doc}
	<RisersRender
		rooms={editor.rooms}
		ladders={editor.ladders}
		cables={editor.cables}
		labels={editor.labels}
		floorHeights={editor.floorHeights}
		settings={editor.settings}
		hiddenFloors={editor.hiddenFloors}
		{fromFloor} {toFloor} {vp} {view} {onview} {hidden}
		onsvg={(el) => editor.svg = el}>
		{#if active}
			<RisersEditLayer {editor} {fromFloor} {toFloor} />
		{/if}
	</RisersRender>
	{#if active}
		<RisersEditPanel {editor} {fromFloor} {toFloor} />
	{/if}
{:else}
	<div class="flex h-full w-full items-center justify-center text-zinc-400 print:hidden" style:font-size="{14 / zoom}px">No risers data</div>
{/if}
