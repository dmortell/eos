<script lang="ts">
	/**
	 * Frames destination pane — floorplan tab (§14 F-3). Read-mostly,
	 * picker-grade rendering: the calibrated PDF page as an image with outlet
	 * dots positioned from their mm coordinates, colored by link coverage of
	 * their linked location. Clicking an outlet terminates the ARMED rear port
	 * to that outlet's location (next free port). Not the full Floorplan tool —
	 * fit-to-width only, editing stays in the Floorplan tool.
	 */
	import { Spinner, type Firestore } from '$lib'
	import { PdfState } from '../../uploads/parts/PdfState.svelte'
	import type { FramesEditor } from './frames-editor.svelte'

	let { db, pid, floor, editor }: { db: Firestore; pid: string; floor: number; editor: FramesEditor } = $props()

	let outletsDoc = $state<any>(null)
	let fileDoc = $state<any>(null)
	let pdfUrl = $state<string | null>(null)
	let pageW = $state(0)
	let pageH = $state(0)
	let containerW = $state(240)

	let docId = $derived(`${pid}_F${String(floor).padStart(2, '0')}`)

	$effect(() => {
		const unsub = db.subscribeOne('outlets', docId, (d: any) => { outletsDoc = d ?? null })
		return () => unsub?.()
	})
	$effect(() => {
		const fileId = outletsDoc?.selectedFileId
		if (!fileId) { fileDoc = null; return }
		const unsub = db.subscribeOne('files', fileId, (d: any) => { fileDoc = d ?? null })
		return () => unsub?.()
	})

	let pageNum = $derived(outletsDoc?.selectedPage ?? 1)
	let calibration = $derived.by(() => {
		const p = fileDoc?.pages?.[pageNum]
		if (p?.origin && p?.scale?.scale) return { origin: p.origin, scaleFactor: p.scale.scale as number }
		return null
	})

	$effect(() => {
		const url = fileDoc?.url
		const pg = pageNum
		if (!url) { pdfUrl = null; return }
		let cancelled = false
		let localUrl: string | null = null
		const pdf = new PdfState()
		;(async () => {
			try {
				await pdf.load(url)
				if (cancelled) return
				const { objectUrl, width, height } = await pdf.renderToObjectUrl(pg, 1.5)
				if (cancelled) { URL.revokeObjectURL(objectUrl); return }
				localUrl = objectUrl
				pdfUrl = objectUrl; pageW = width; pageH = height
			} catch {
				if (!cancelled) pdfUrl = null
			}
		})()
		return () => {
			cancelled = true
			if (localUrl) URL.revokeObjectURL(localUrl)
			pdf.destroy()
		}
	})

	/** Fit-to-width scale: rendered-page px → container px. */
	let fit = $derived(pageW > 0 ? containerW / pageW : 1)
	/** mm → rendered-page px (render scale 1.5 matches renderToObjectUrl). */
	function toPagePx(mm: { x: number; y: number }): { x: number; y: number } {
		const c = calibration!
		return {
			x: (mm.x / c.scaleFactor + c.origin.x) * 1.5,
			y: (mm.y / c.scaleFactor + c.origin.y) * 1.5,
		}
	}

	let outlets = $derived((outletsDoc?.outlets ?? []) as any[])

	function coverageClass(o: any): string {
		if (!o.locationId) return 'bg-gray-300 border-gray-400'
		const loc = editor.locationById.get(o.locationId)
		const linked = editor.linkedPortsByLocation.get(o.locationId) ?? 0
		if (!loc) return 'bg-amber-300 border-amber-500'
		if (linked >= loc.portCount) return 'bg-emerald-400 border-emerald-600'
		if (linked > 0) return 'bg-amber-400 border-amber-600'
		return editor.termArm ? 'bg-blue-400 border-blue-600' : 'bg-sky-300 border-sky-500'
	}

	function pick(o: any) {
		if (!o.locationId) { editor.statusHint = `${o.label ?? 'Outlet'} is not linked to a location — link it in the Floorplan tool first`; return }
		if (!editor.termArm) { editor.statusHint = 'Arm a rear port first (click an unterminated port), then pick an outlet'; return }
		editor.terminateToLocation(o.locationId)
	}
</script>

<div class="h-full overflow-auto" bind:clientWidth={containerW}>
	{#if !outletsDoc?.selectedFileId}
		<div class="p-3 text-[11px] text-gray-400">No floorplan selected for this floor — pick one in the Floorplan tool.</div>
	{:else if !pdfUrl}
		<div class="p-4 flex justify-center"><Spinner /></div>
	{:else}
		<div class="relative" style:width="{pageW * fit}px" style:height="{pageH * fit}px">
			<img src={pdfUrl} alt="floorplan" class="absolute inset-0 w-full h-full" draggable="false" />
			{#if calibration}
				{#each outlets as o (o.id)}
					{@const p = toPagePx(o.position)}
					<button
						class="absolute w-2.5 h-2.5 -ml-1.25 -mt-1.25 rounded-full border {coverageClass(o)} hover:scale-150 transition-transform"
						style:left="{p.x * fit}px" style:top="{p.y * fit}px"
						title={`${o.label ?? o.id}${o.locationId ? '' : ' — not linked to a location'}${editor.termArm && o.locationId ? '\nclick: terminate armed port here' : ''}`}
						onclick={() => pick(o)}></button>
				{/each}
			{:else}
				<div class="absolute inset-x-0 top-0 p-2 text-[10px] text-amber-600 bg-amber-50/80">Floorplan not calibrated — outlet positions unavailable.</div>
			{/if}
		</div>
	{/if}
</div>
