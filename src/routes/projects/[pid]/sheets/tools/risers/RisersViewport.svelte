<script lang="ts">
	import { getContext } from 'svelte'
	import type { Firestore } from '$lib/db.svelte'
	import type { SheetViewport } from '../../types'
	import type { RiserDocData } from './types'
	import RisersRender from './RisersRender.svelte'
	import RisersEditLayer from './RisersEditLayer.svelte'
	import RisersEditPanel from './RisersEditPanel.svelte'
	import { RisersEditor } from './risers-editor.svelte'
	import EditBackground from '../../edit/EditBackground.svelte'
	import AnnotationLayer from '../../annotations/AnnotationLayer.svelte'
	import { useViewportEditing } from '../../edit/editing.svelte'
	import type { ViewportEditor } from '../../viewports.svelte'
	import { layerBlockReason } from '../../layers/layers'
	import { toast } from 'svelte-sonner'

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
	let annLocked = $derived(locked.includes('annotations'))
	let annHidden = $derived(hidden.includes('annotations'))
	function blocked(id: string): boolean {
		const reason = layerBlockReason(id, hidden, locked)
		if (reason) { toast.warning(reason); return true }
		return false
	}
	const editor = new RisersEditor()
	let src = $derived(vp.source.kind === 'risers' ? vp.source : null)
	let doc = $state<RiserDocData | null>(null)
	const { annEditor, history } = useViewportEditing({
		editor, collection: 'risers', docId: () => src?.risersDocId, doc: () => doc,
		active: () => active, vp: () => vp, vps, db,
	})
	annEditor.onPlaced = () => { tool = 'select' }

	$effect(() => {
		const id = src?.risersDocId
		if (!id) { doc = null; return }
		const unsub = db.subscribeOne('risers', id, (d: any) => { doc = d ?? null })
		return () => unsub?.()
	})

	let fromFloor = $derived(src?.fromFloor ?? doc?.fromFloor ?? 1)
	let toFloor = $derived(src?.toFloor ?? doc?.toFloor ?? 1)
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
				else if (editor.sel) { e.preventDefault(); e.stopPropagation(); editor.deleteSel() }
			}
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
		{fromFloor} {toFloor} {vp} {view} {hidden}
		onview={(v) => { viewDen = v.den || 1; onview?.(v) }}
		onsvg={(el) => { editor.svg = el; annEditor.svg = el }}>
		{#if active}
			<EditBackground {tool} {annEditor} toolEditor={editor} annLocked={annLocked || annHidden}
				onblocked={() => blocked('annotations')}
				onadd={(t, w) => {
					const f = editor.floorAtY(w.y, fromFloor, toFloor) ?? fromFloor
					if (t === 'room') { if (blocked('rooms')) return true; editor.addRoomAt('server', w.x, f, () => { tool = 'select' }); return true }
					if (t === 'riser') { if (blocked('ladders')) return true; editor.addLadderDrag(w.x, f, fromFloor, toFloor, () => { tool = 'select' }); return true }
					return false
				}} />
			<RisersEditLayer {editor} {fromFloor} {toFloor} interactive={tool === 'select'} />
		{/if}
		{#if !annHidden}
			<AnnotationLayer editor={annEditor} interactive={active && tool === 'select'} locked={annLocked} den={viewDen} />
		{/if}
	</RisersRender>
	{#if active}
		<RisersEditPanel {editor} bind:tool {annEditor} {fromFloor} {toFloor} />
	{/if}
{:else}
	<div class="flex h-full w-full items-center justify-center text-zinc-400 print:hidden" style:font-size="{14 / zoom}px">No risers data</div>
{/if}
