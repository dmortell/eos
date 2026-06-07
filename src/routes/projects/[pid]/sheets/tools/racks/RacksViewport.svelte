<script lang="ts">
	import { getContext } from 'svelte'
	import type { Firestore } from '$lib/db.svelte'
	import type { SheetViewport } from '../../types'
	import type { RackDocData } from './types'
	import RacksRender from './RacksRender.svelte'
	import RacksEditLayer from './RacksEditLayer.svelte'
	import RacksEditPanel from './RacksEditPanel.svelte'
	import { RacksEditor } from './racks-editor.svelte'
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

	let src = $derived(vp.source.kind === 'racks' ? vp.source : null)
	let doc = $state<RackDocData | null>(null)

	$effect(() => {
		const id = src?.racksDocId
		if (!id) { doc = null; return }
		const unsub = db.subscribeOne('racks', id, (d: any) => { doc = d ?? null })
		return () => unsub?.()
	})

	// ── Editing ──
	const editor = new RacksEditor()
	$effect(() => { if (!active) editor.seed(doc) })
	$effect(() => {
		const id = src?.racksDocId
		if (!id) { editor.onChange = null; return }
		const saver = docSaver(db, 'racks', id)
		editor.onChange = () => saver.save(editor.snapshot())
		return () => { saver.flush(); editor.onChange = null }
	})
	$effect(() => {
		if (!active) return
		const onKey = (e: KeyboardEvent) => {
			const f = (e.target as Element)?.closest?.('input, textarea, select, [contenteditable]')
			if (e.key === 'Delete' && !f) { e.preventDefault(); e.stopPropagation(); if (editor.selDevice) editor.deleteDevice(); else if (editor.selRack) editor.deleteRack() }
		}
		window.addEventListener('keydown', onKey, true)
		return () => window.removeEventListener('keydown', onKey, true)
	})
</script>

{#if src}
	<RacksRender
		racks={editor.racks}
		devices={editor.devices}
		settings={editor.settings}
		roomObjects={editor.roomObjects}
		rows={editor.rows}
		face={src.face}
		rowId={src.rowId}
		showWalls={src.showWalls ?? false}
		colorDevices={src.colorDevices ?? true}
		{vp} {view} {onview} {hidden}
		onsvg={(el) => editor.svg = el}>
		{#if active}
			<RacksEditLayer {editor} face={src.face} />
		{/if}
	</RacksRender>
	{#if active}
		<RacksEditPanel {editor} />
	{/if}
{:else}
	<div class="flex h-full w-full items-center justify-center text-zinc-400 print:hidden" style:font-size="{14 / zoom}px">No racks source</div>
{/if}
