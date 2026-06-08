<script lang="ts">
	import { getContext } from 'svelte'
	import type { Firestore } from '$lib/db.svelte'
	import type { SheetViewport } from '../../types'
	import type { RackDocData } from './types'
	import RacksRender from './RacksRender.svelte'
	import RacksEditLayer from './RacksEditLayer.svelte'
	import RacksEditPanel from './RacksEditPanel.svelte'
	import { RacksEditor } from './racks-editor.svelte'
	import { buildElevation, rackAtX, slotAtY } from './layout'
	import EditBackground from '../../edit/EditBackground.svelte'
	import AnnotationLayer from '../../annotations/AnnotationLayer.svelte'
	import { useAnnotations } from '../../edit/annotations.svelte'
	import type { ViewportEditor } from '../../viewports.svelte'
	import { docSaver } from '../../edit/persist'

	let { vp, vps, zoom = 1, active = false, view = null, onview, hidden = [], locked = [] }: {
		vp: SheetViewport
		vps: ViewportEditor
		zoom?: number
		active?: boolean
		view?: { x: number; y: number; w: number; h: number } | null
		onview?: (v: { x: number; y: number; w: number; h: number; den: number }) => void
		hidden?: string[]
		locked?: string[]
	} = $props()
	const db = getContext('db') as Firestore

	let tool = $state('select')
	let annLocked = $derived(locked.includes('annotations'))
	const editor = new RacksEditor()
	const annEditor = useAnnotations({ vp: () => vp, active: () => active, vps, toolEditor: editor })

	let src = $derived(vp.source.kind === 'racks' ? vp.source : null)
	let doc = $state<RackDocData | null>(null)

	$effect(() => {
		const id = src?.racksDocId
		if (!id) { doc = null; return }
		const unsub = db.subscribeOne('racks', id, (d: any) => { doc = d ?? null })
		return () => unsub?.()
	})

	// ── Editing ── seed from the doc while idle; seed once even if mounted active (model mode).
	let seeded = false
	$effect(() => {
		const d = doc
		if (!active) { editor.seed(d); seeded = !!d; return }
		if (!seeded && d) { editor.seed(d); seeded = true }
	})
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
			if (e.key === 'Delete' && !f) {
				if (annEditor.selAnn) { e.preventDefault(); e.stopPropagation(); annEditor.deleteSel() }
				else if (editor.selDevice) { e.preventDefault(); e.stopPropagation(); editor.deleteDevice() }
				else if (editor.selRack) { e.preventDefault(); e.stopPropagation(); editor.deleteRack() }
			}
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
		onsvg={(el) => { editor.svg = el; annEditor.svg = el }}>
		{#if active}
			<EditBackground {tool} {annEditor} toolEditor={editor} {annLocked}
				onadd={(t, w) => {
					if (t !== 'device' || src.face === 'plan') return false
					const scoped = src.rowId ? editor.racks.filter(r => r.rowId === src.rowId) : editor.racks
					const el = buildElevation(scoped, editor.settings, src.face)
					const e = rackAtX(el, w.x); if (!e) return true
					editor.addDeviceAt(e.rack.id, slotAtY(e, el, w.y, 1)); return true
				}} />
			<RacksEditLayer {editor} face={src.face} rowId={src.rowId} interactive={tool === 'select'} />
		{/if}
		<AnnotationLayer editor={annEditor} interactive={active && tool === 'select'} locked={annLocked} />
	</RacksRender>
	{#if active}
		<RacksEditPanel {editor} bind:tool {annEditor} face={src.face} />
	{/if}
{:else}
	<div class="flex h-full w-full items-center justify-center text-zinc-400 print:hidden" style:font-size="{14 / zoom}px">No racks source</div>
{/if}
