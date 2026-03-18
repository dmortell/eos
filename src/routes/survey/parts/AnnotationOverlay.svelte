<script lang="ts">
	import { Icon } from '$lib'
	import type { AnnotationData } from '../types'

	let {
		width,
		height,
		annotations = $bindable([]),
		readonly = false,
	}: {
		width: number
		height: number
		annotations: AnnotationData[]
		readonly?: boolean
	} = $props()

	let tool: 'path' | 'arrow' | 'rect' | 'text' = $state('path')
	let color = $state('#ef4444')
	let strokeWidth = $state(3)
	let drawing = $state(false)
	let currentPoints: number[][] = $state([])
	let startPoint: { x: number; y: number } | null = $state(null)
	let textInput = $state('')
	let textPos: { x: number; y: number } | null = $state(null)
	let undoStack: AnnotationData[][] = $state([])

	const colors = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#ffffff', '#000000']

	function getPos(e: MouseEvent | TouchEvent, svg: SVGSVGElement): { x: number; y: number } {
		const rect = svg.getBoundingClientRect()
		const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
		const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
		return {
			x: ((clientX - rect.left) / rect.width) * width,
			y: ((clientY - rect.top) / rect.height) * height,
		}
	}

	function handlePointerDown(e: MouseEvent | TouchEvent) {
		if (readonly) return
		const svg = (e.currentTarget as SVGSVGElement)
		const pos = getPos(e, svg)

		if (tool === 'text') {
			textPos = pos
			return
		}

		drawing = true
		startPoint = pos

		if (tool === 'path') {
			currentPoints = [[pos.x, pos.y]]
		}
	}

	function handlePointerMove(e: MouseEvent | TouchEvent) {
		if (!drawing || readonly) return
		const svg = (e.currentTarget as SVGSVGElement)
		const pos = getPos(e, svg)

		if (tool === 'path') {
			currentPoints = [...currentPoints, [pos.x, pos.y]]
		} else if (tool === 'arrow' || tool === 'rect') {
			currentPoints = [[startPoint!.x, startPoint!.y], [pos.x, pos.y]]
		}
	}

	function handlePointerUp() {
		if (!drawing || readonly) return
		drawing = false

		if (tool === 'path' && currentPoints.length > 1) {
			pushAnnotation({ type: 'path', points: currentPoints, color, strokeWidth })
		} else if (tool === 'arrow' && currentPoints.length === 2) {
			pushAnnotation({ type: 'arrow', points: currentPoints, color, strokeWidth })
		} else if (tool === 'rect' && currentPoints.length === 2) {
			const [p1, p2] = currentPoints
			pushAnnotation({
				type: 'rect',
				bounds: {
					x: Math.min(p1[0], p2[0]),
					y: Math.min(p1[1], p2[1]),
					w: Math.abs(p2[0] - p1[0]),
					h: Math.abs(p2[1] - p1[1]),
				},
				color,
				strokeWidth,
			})
		}

		currentPoints = []
		startPoint = null
	}

	function handleTextSubmit() {
		if (!textInput.trim() || !textPos) return
		pushAnnotation({ type: 'text', points: [[textPos.x, textPos.y]], text: textInput.trim(), color, strokeWidth })
		textInput = ''
		textPos = null
	}

	function pushAnnotation(ann: AnnotationData) {
		undoStack = [...undoStack, [...annotations]]
		annotations = [...annotations, ann]
	}

	function undo() {
		if (undoStack.length === 0) return
		annotations = undoStack[undoStack.length - 1]
		undoStack = undoStack.slice(0, -1)
	}

	function clearAll() {
		undoStack = [...undoStack, [...annotations]]
		annotations = []
	}

	function pathD(points: number[][]): string {
		if (points.length < 2) return ''
		return 'M' + points.map(p => `${p[0]},${p[1]}`).join('L')
	}

	function arrowHead(p1: number[], p2: number[], size: number): string {
		const angle = Math.atan2(p2[1] - p1[1], p2[0] - p1[0])
		const a1 = angle + Math.PI * 0.82
		const a2 = angle - Math.PI * 0.82
		return `M${p2[0]},${p2[1]} L${p2[0] + size * Math.cos(a1)},${p2[1] + size * Math.sin(a1)} M${p2[0]},${p2[1]} L${p2[0] + size * Math.cos(a2)},${p2[1] + size * Math.sin(a2)}`
	}
</script>

{#if !readonly}
	<!-- Toolbar -->
	<div class="absolute left-1/2 top-2 z-10 -translate-x-1/2">
		<div class="flex items-center gap-1 rounded-lg bg-black/70 px-2 py-1.5 backdrop-blur">
		<!-- Drawing tools -->
		<button type="button" class="flex h-8 w-8 items-center justify-center rounded {tool === 'path' ? 'bg-white/20' : ''}" title="Freehand" onclick={() => (tool = 'path')}>
			<Icon name="pen" size={16} class="text-white" />
		</button>
		<button type="button" class="flex h-8 w-8 items-center justify-center rounded {tool === 'arrow' ? 'bg-white/20' : ''}" title="Arrow" onclick={() => (tool = 'arrow')}>
			<Icon name="arrowLeft" size={16} class="rotate-180 text-white" />
		</button>
		<button type="button" class="flex h-8 w-8 items-center justify-center rounded {tool === 'rect' ? 'bg-white/20' : ''}" title="Rectangle" onclick={() => (tool = 'rect')}>
			<Icon name="square" size={16} class="text-white" />
		</button>
		<button type="button" class="flex h-8 w-8 items-center justify-center rounded {tool === 'text' ? 'bg-white/20' : ''}" title="Text" onclick={() => (tool = 'text')}>
			<Icon name="text" size={16} class="text-white" />
		</button>

		<div class="mx-1 h-5 w-px bg-white/20"></div>

		<!-- Colors -->
		{#each colors as c}
			<button type="button" class="h-6 w-6 rounded-full border-2 {color === c ? 'border-white' : 'border-transparent'}" style:background={c} onclick={() => (color = c)}></button>
		{/each}

		<div class="mx-1 h-5 w-px bg-white/20"></div>

		<!-- Undo/Clear -->
		<button type="button" class="flex h-8 w-8 items-center justify-center rounded active:bg-white/20" title="Undo" onclick={undo} disabled={undoStack.length === 0}>
			<Icon name="undo" size={16} class="text-white {undoStack.length === 0 ? 'opacity-30' : ''}" />
		</button>
		<button type="button" class="flex h-8 w-8 items-center justify-center rounded active:bg-white/20" title="Clear all" onclick={clearAll} disabled={annotations.length === 0}>
			<Icon name="trash" size={16} class="text-white {annotations.length === 0 ? 'opacity-30' : ''}" />
		</button>
		</div>
	</div>
{/if}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<svg
	viewBox="0 0 {width} {height}"
	class="absolute left-0 top-0 h-full w-full"
	style="touch-action: none"
	onmousedown={handlePointerDown}
	onmousemove={handlePointerMove}
	onmouseup={handlePointerUp}
	ontouchstart={handlePointerDown}
	ontouchmove={handlePointerMove}
	ontouchend={handlePointerUp}
>
	<!-- Existing annotations -->
	{#each annotations as ann}
		{#if ann.type === 'path' && ann.points}
			<path d={pathD(ann.points)} fill="none" stroke={ann.color} stroke-width={ann.strokeWidth} stroke-linecap="round" stroke-linejoin="round" />
		{:else if ann.type === 'arrow' && ann.points && ann.points.length === 2}
			<line x1={ann.points[0][0]} y1={ann.points[0][1]} x2={ann.points[1][0]} y2={ann.points[1][1]} stroke={ann.color} stroke-width={ann.strokeWidth} stroke-linecap="round" />
			<path d={arrowHead(ann.points[0], ann.points[1], ann.strokeWidth * 4)} fill="none" stroke={ann.color} stroke-width={ann.strokeWidth} stroke-linecap="round" />
		{:else if ann.type === 'rect' && ann.bounds}
			<rect x={ann.bounds.x} y={ann.bounds.y} width={ann.bounds.w} height={ann.bounds.h} fill="none" stroke={ann.color} stroke-width={ann.strokeWidth} />
		{:else if ann.type === 'text' && ann.points && ann.text}
			<text x={ann.points[0][0]} y={ann.points[0][1]} fill={ann.color} font-size={ann.strokeWidth * 6} font-weight="600">{ann.text}</text>
		{/if}
	{/each}

	<!-- Current drawing preview -->
	{#if drawing && tool === 'path' && currentPoints.length > 1}
		<path d={pathD(currentPoints)} fill="none" stroke={color} stroke-width={strokeWidth} stroke-linecap="round" stroke-linejoin="round" opacity="0.7" />
	{:else if drawing && tool === 'arrow' && currentPoints.length === 2}
		<line x1={currentPoints[0][0]} y1={currentPoints[0][1]} x2={currentPoints[1][0]} y2={currentPoints[1][1]} stroke={color} stroke-width={strokeWidth} stroke-linecap="round" opacity="0.7" />
		<path d={arrowHead(currentPoints[0], currentPoints[1], strokeWidth * 4)} fill="none" stroke={color} stroke-width={strokeWidth} stroke-linecap="round" opacity="0.7" />
	{:else if drawing && tool === 'rect' && currentPoints.length === 2}
		{@const x = Math.min(currentPoints[0][0], currentPoints[1][0])}
		{@const y = Math.min(currentPoints[0][1], currentPoints[1][1])}
		{@const w = Math.abs(currentPoints[1][0] - currentPoints[0][0])}
		{@const h = Math.abs(currentPoints[1][1] - currentPoints[0][1])}
		<rect x={x} y={y} width={w} height={h} fill="none" stroke={color} stroke-width={strokeWidth} opacity="0.7" />
	{/if}
</svg>

<!-- Text input modal -->
{#if textPos}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onclick={() => (textPos = null)}>
		<div class="mx-4 w-full max-w-sm rounded-xl bg-white p-4 shadow-lg" onclick={e => e.stopPropagation()}>
			<input
				type="text"
				class="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
				placeholder="Enter text..."
				bind:value={textInput}
				autofocus
				onkeydown={(e) => { if (e.key === 'Enter') handleTextSubmit() }}
			/>
			<div class="mt-3 flex justify-end gap-2">
				<button type="button" class="rounded-lg border border-gray-300 px-4 py-2 text-sm" onclick={() => (textPos = null)}>Cancel</button>
				<button type="button" class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white" onclick={handleTextSubmit}>Add</button>
			</div>
		</div>
	</div>
{/if}
