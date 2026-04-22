<script lang="ts">
	import type { TitleBlockConfig } from '$lib/types/pages'

	/**
	 * Project-level defaults for title-block fields. Anything absent here can
	 * still be populated via `config.fields` on a per-page basis.
	 */
	export interface TitleBlockProjectDefaults {
		name?: string
		author?: string
		address?: string
		logoUrl?: string
		client?: string
	}

	let {
		config,
		project = {},
		drawingTitle,
		drawingNumber,
		revisionCode,
		paperSize,
		scaleDenominator,
		pxPerMm,
		onupdate,
	}: {
		config: TitleBlockConfig
		project?: TitleBlockProjectDefaults
		drawingTitle: string
		drawingNumber?: string
		revisionCode?: string
		paperSize: string
		scaleDenominator: number
		/** Canvas zoom factor — used to convert px drag deltas to mm. */
		pxPerMm: number
		/** Optional callback to persist layout changes (position, size, template). */
		onupdate?: (patch: Partial<TitleBlockConfig>) => void
	} = $props()

	/** Default bottom-right placement is computed by the canvas; here we just consume it. */
	let posX = $derived(config.positionMm?.x ?? 0)
	let posY = $derived(config.positionMm?.y ?? 0)
	let widthMm = $derived(config.widthMm ?? (config.template === 'compact' ? 120 : 180))
	let heightMm = $derived(config.heightMm ?? (config.template === 'compact' ? 20 : 60))

	/**
	 * Resolve a field in priority order: per-page override > project default > fallback.
	 * Keeps the template free of null-coalescing chains.
	 */
	function field(key: string, projectFallback: string | undefined, fallback = ''): string {
		return (config.fields?.[key] ?? projectFallback ?? fallback).trim()
	}

	let fProjectName = $derived(field('projectName', project.name, ''))
	let fClient      = $derived(field('client', project.client, ''))
	let fAddress     = $derived(field('address', project.address, ''))
	let fDrawnBy     = $derived(field('drawnBy', project.author, ''))
	let fCheckedBy   = $derived(field('checkedBy', undefined, ''))
	let fApprovedBy  = $derived(field('approvedBy', undefined, ''))
	let fDate        = $derived(field('date', undefined, new Date().toISOString().slice(0, 10)))
	let fNumber      = $derived(field('drawingNumber', drawingNumber, ''))
	let fTitle       = $derived(field('title', drawingTitle, ''))
	let fRevision    = $derived(field('revision', revisionCode, '—'))
	let fScale       = $derived(field('scale', `1:${scaleDenominator}`, ''))
	let fPaper       = $derived(field('paper', paperSize, ''))
	let fLogo        = $derived(config.fields?.logoUrl ?? project.logoUrl ?? '')

	// ── Drag (reposition only; no resize for P6) ──
	let dragStart = $state<{ mouseX: number; mouseY: number; startX: number; startY: number } | null>(null)

	function onBodyMouseDown(e: MouseEvent) {
		if (e.button !== 0 || !onupdate) return
		e.stopPropagation()
		dragStart = {
			mouseX: e.clientX,
			mouseY: e.clientY,
			startX: posX,
			startY: posY,
		}
		window.addEventListener('mousemove', onMouseMove)
		window.addEventListener('mouseup', onMouseUp)
	}

	function onMouseMove(e: MouseEvent) {
		if (!dragStart || !onupdate) return
		const dxMm = (e.clientX - dragStart.mouseX) / pxPerMm
		const dyMm = (e.clientY - dragStart.mouseY) / pxPerMm
		onupdate({ positionMm: { x: dragStart.startX + dxMm, y: dragStart.startY + dyMm } })
	}

	function onMouseUp() {
		dragStart = null
		window.removeEventListener('mousemove', onMouseMove)
		window.removeEventListener('mouseup', onMouseUp)
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="absolute border border-zinc-700 bg-white text-black select-none"
	style:left="{posX}px"
	style:top="{posY}px"
	style:width="{widthMm}px"
	style:height="{heightMm}px"
	style:cursor={onupdate ? (dragStart ? 'grabbing' : 'grab') : 'default'}
	onmousedown={onBodyMouseDown}
>
	{#if config.template === 'compact'}
		<!-- Compact: single row with the essentials. -->
		<div class="w-full h-full grid grid-cols-[1fr_auto_auto_auto_auto] items-center px-2 gap-2 text-[2.4pt] leading-none font-medium">
			<div class="truncate">
				{#if fProjectName}<span class="font-bold">{fProjectName}</span> · {/if}{fTitle}
			</div>
			<div>No. <span class="font-mono">{fNumber || '—'}</span></div>
			<div>Rev <span class="font-mono font-bold">{fRevision}</span></div>
			<div><span class="font-mono">{fScale}</span></div>
			<div><span class="font-mono">{fPaper}</span></div>
		</div>
	{:else}
		<!-- Standard: ISO-style 3-band grid. Dimensions scale with widthMm/heightMm. -->
		<div class="w-full h-full grid"
			style:grid-template-rows="40% 30% 30%"
			style:grid-template-columns="40% 60%">

			<!-- Top-left: logo + project name + client/address -->
			<div class="border-r border-b border-zinc-400 p-1 flex flex-col justify-between overflow-hidden">
				<div class="flex items-start gap-1">
					{#if fLogo}
						<img src={fLogo} alt="logo" class="h-5 w-auto object-contain" draggable="false" />
					{/if}
					<div class="flex-1 min-w-0">
						<div class="text-[3pt] font-bold uppercase tracking-wider truncate">{fProjectName || '—'}</div>
						{#if fClient}<div class="text-[2pt] text-zinc-600 truncate">{fClient}</div>{/if}
					</div>
				</div>
				{#if fAddress}
					<div class="text-[2pt] text-zinc-500 leading-tight line-clamp-2">{fAddress}</div>
				{/if}
			</div>

			<!-- Top-right: drawing title -->
			<div class="border-b border-zinc-400 p-1 flex flex-col justify-center overflow-hidden">
				<div class="text-[1.8pt] uppercase tracking-wider text-zinc-500">Drawing Title</div>
				<div class="text-[3pt] font-semibold leading-tight mt-0.5 line-clamp-3">{fTitle || '—'}</div>
			</div>

			<!-- Mid-left: drawn / checked / approved grid -->
			<div class="border-r border-b border-zinc-400 grid grid-cols-3 text-[2pt]">
				<div class="p-1 border-r border-zinc-400 flex flex-col justify-between">
					<span class="uppercase tracking-wider text-zinc-500">Drawn</span>
					<span class="font-mono text-[2.4pt]">{fDrawnBy || '—'}</span>
				</div>
				<div class="p-1 border-r border-zinc-400 flex flex-col justify-between">
					<span class="uppercase tracking-wider text-zinc-500">Checked</span>
					<span class="font-mono text-[2.4pt]">{fCheckedBy || '—'}</span>
				</div>
				<div class="p-1 flex flex-col justify-between">
					<span class="uppercase tracking-wider text-zinc-500">Approved</span>
					<span class="font-mono text-[2.4pt]">{fApprovedBy || '—'}</span>
				</div>
			</div>

			<!-- Mid-right: Drawing No. + Revision -->
			<div class="border-b border-zinc-400 grid grid-cols-[2fr_1fr] text-[2pt]">
				<div class="p-1 border-r border-zinc-400 flex flex-col justify-between">
					<span class="uppercase tracking-wider text-zinc-500">Drawing No.</span>
					<span class="font-mono text-[3pt] font-bold">{fNumber || '—'}</span>
				</div>
				<div class="p-1 flex flex-col justify-between">
					<span class="uppercase tracking-wider text-zinc-500">Rev.</span>
					<span class="font-mono text-[3pt] font-bold">{fRevision}</span>
				</div>
			</div>

			<!-- Bottom-left: Date -->
			<div class="border-r border-zinc-400 p-1 flex items-center text-[2pt]">
				<span class="uppercase tracking-wider text-zinc-500 mr-1">Date</span>
				<span class="font-mono text-[2.4pt]">{fDate}</span>
			</div>

			<!-- Bottom-right: Scale + Paper -->
			<div class="grid grid-cols-2 text-[2pt]">
				<div class="p-1 border-r border-zinc-400 flex items-center">
					<span class="uppercase tracking-wider text-zinc-500 mr-1">Scale</span>
					<span class="font-mono text-[2.4pt]">{fScale}</span>
				</div>
				<div class="p-1 flex items-center">
					<span class="uppercase tracking-wider text-zinc-500 mr-1">Size</span>
					<span class="font-mono text-[2.4pt]">{fPaper}</span>
				</div>
			</div>
		</div>
	{/if}
</div>
