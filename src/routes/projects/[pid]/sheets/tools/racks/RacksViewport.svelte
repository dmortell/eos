<script lang="ts">
	import { getContext, untrack } from 'svelte'
	import type { Firestore } from '$lib/db.svelte'
	import type { SheetViewport } from '../../types'
	import type { RackDocData } from './types'
	import type { DeviceTemplate } from './palette'
	import type { ViewportEditor } from '../../viewports.svelte'
	import RacksRender from './RacksRender.svelte'
	import RacksEditLayer from './RacksEditLayer.svelte'
	import RacksEditPanel from './RacksEditPanel.svelte'
	import DeviceLibrary from './DeviceLibrary.svelte'
	import EditBackground from '../../edit/EditBackground.svelte'
	import AnnotationLayer from '../../annotations/AnnotationLayer.svelte'
	import { RacksEditor } from './racks-editor.svelte'
	import { buildElevation, rackAtX, slotAtY } from './rack-layout'
	import { useAnnotations } from '../../edit/annotations.svelte'
	import { History } from '../../edit/history.svelte'
	import { layerBlockReason } from '../../layers/layers'
	import { toast } from 'svelte-sonner'
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
	let viewDen = $state(1)
	let showLibrary = $state(false)
	let annLocked = $derived(locked.includes('annotations'))
	let annHidden = $derived(hidden.includes('annotations'))
	function blocked(id: string): boolean {
		const reason = layerBlockReason(id, hidden, locked)
		if (reason) { toast.warning(reason); return true }
		return false
	}

	// Drop a dragged library template onto the rack under the cursor (elevation only).
	function placeFromDrop(t: DeviceTemplate, clientX: number, clientY: number) {
		if (!src || src.face === 'plan' || blocked('devices')) return
		const w = editor.toWorldXY(clientX, clientY); if (!w) return
		const scoped = src.rowId ? editor.racks.filter(r => r.rowId === src.rowId) : editor.racks
		const el = buildElevation(scoped, editor.settings, src.face)
		const e = rackAtX(el, w.x); if (!e) return
		editor.addDeviceFromTemplate(e.rack.id, slotAtY(e, el, w.y, t.heightU || 1), t)
	}
	const editor = new RacksEditor()
	const history = new History()
	const annEditor = useAnnotations({ vp: () => vp, active: () => active, vps, toolEditor: editor, afterChange: () => history.touch() })
	annEditor.onPlaced = () => { tool = 'select' }

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
		if (!active) { editor.seed(d); seeded = !!d; untrack(() => { history.register(editor, annEditor); history.reset() }); return }
		if (!seeded && d) { editor.seed(d); seeded = true; untrack(() => { history.register(editor, annEditor); history.reset() }) }
	})
	$effect(() => {
		const id = src?.racksDocId
		if (!id) { editor.onChange = null; return }
		const saver = docSaver(db, 'racks', id)
		editor.onChange = () => { saver.save(editor.snapshot()); history.touch() }
		return () => { saver.flush(); editor.onChange = null }
	})
	$effect(() => {
		if (!active) return
		const onKey = (e: KeyboardEvent) => {
			const f = (e.target as Element)?.closest?.('input, textarea, select, [contenteditable]')
			if (f) return
			if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); e.stopPropagation(); if (e.shiftKey) history.redo(); else history.undo(); return }
			if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); e.stopPropagation(); history.redo(); return }
			if (e.key === 'Delete') {
				if (editor.hasMultiSel() || annEditor.hasMultiSel()) { e.preventDefault(); e.stopPropagation(); editor.deleteMany(); annEditor.deleteMany() }
				else if (annEditor.selAnn) { e.preventDefault(); e.stopPropagation(); annEditor.deleteSel() }
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
		{vp} {view} {hidden}
		onview={(v) => { viewDen = v.den || 1; onview?.(v) }}
		onsvg={(el) => { editor.svg = el; annEditor.svg = el }}>
		{#if active}
			<EditBackground {tool} {annEditor} toolEditor={editor} annLocked={annLocked || annHidden}
				onblocked={() => blocked('annotations')}
				onadd={(t, w) => {
					if (t !== 'device' || src.face === 'plan' || blocked('devices')) return false
					const scoped = src.rowId ? editor.racks.filter(r => r.rowId === src.rowId) : editor.racks
					const el = buildElevation(scoped, editor.settings, src.face)
					const e = rackAtX(el, w.x); if (!e) return true
					editor.addDeviceAt(e.rack.id, slotAtY(e, el, w.y, 1)); return true
				}} />
			<RacksEditLayer {editor} face={src.face} rowId={src.rowId} interactive={tool === 'select'} />
		{/if}
		{#if !annHidden}
			<AnnotationLayer editor={annEditor} interactive={active && tool === 'select'} locked={annLocked} den={viewDen} />
		{/if}
	</RacksRender>
	{#if active}
		<RacksEditPanel {editor} bind:tool {annEditor} face={src.face} libraryOpen={showLibrary} ondevices={() => { showLibrary = !showLibrary }} />
		{#if showLibrary && src.face !== 'plan'}
			<DeviceLibrary {editor} ondrop={placeFromDrop} onclose={() => { showLibrary = false }} />
		{/if}
	{/if}
{:else}
	<div class="flex h-full w-full items-center justify-center text-zinc-400 print:hidden" style:font-size="{14 / zoom}px">No racks source</div>
{/if}
