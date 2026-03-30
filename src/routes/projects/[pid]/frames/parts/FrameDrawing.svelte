<script lang="ts">
	import type { RackData, PanelData, FrameSlot, LocType } from './types'
	import PanelStrip from './PanelStrip.svelte'
	import SelectionRect from './SelectionRect.svelte'

	let { racks, selectedFrameId, selectedLocations, selectedPorts, reservationMap, oppositePanelRUs, frameFace, onselect, onblockselect }: {
		racks: RackData[]
		selectedFrameId?: string | null
		selectedLocations?: Set<string>
		selectedPorts?: Set<string>
		reservationMap?: Map<string, LocType>
		oppositePanelRUs?: Map<string, Set<number>>
		frameFace?: 'front' | 'rear'
		onselect?: (key: string) => void
		onblockselect?: (portKeys: string[], event: PointerEvent) => void
	} = $props()

	/** Show only the selected frame, or all if none selected */
	let visibleRacks = $derived(
		selectedFrameId
			? racks.filter(r => r.frame.id === selectedFrameId)
			: racks
	)

	type RUItem =
		| { type: 'panel'; panel: PanelData }
		| { type: 'slot'; slot: FrameSlot }
		| { type: 'empty'; ru: number }

	/** Build a full RU map for a rack, bottom-up (RU 1 = bottom) */
	function buildRUMap(rack: RackData): RUItem[] {
		const totalRU = rack.frame.totalRU
		const items: RUItem[] = []

		// Map occupied RUs
		const occupied = new Map<number, RUItem>()
		for (const panel of rack.panels) {
			occupied.set(panel.ru, { type: 'panel', panel })
		}
		for (const slot of rack.frame.slots) {
			occupied.set(slot.ru, { type: 'slot', slot })
			for (let h = 1; h < slot.height; h++) {
				if (slot.ru + h <= totalRU) occupied.set(slot.ru + h, { type: 'slot', slot })
			}
		}

		// Build list top-down (highest RU first in visual)
		for (let ru = totalRU; ru >= 1; ru--) {
			const item = occupied.get(ru)
			if (item) {
				// Skip extra RUs of a multi-U slot (only render at base RU)
				if (item.type === 'slot' && ru !== item.slot.ru) continue
				items.push(item)
			} else {
				items.push({ type: 'empty', ru })
			}
		}

		return items
	}

	const DEVICE_COLORS: Record<string, { bg: string; text: string }> = {
		switch: { bg: 'bg-green-50', text: 'text-green-700' },
		router: { bg: 'bg-blue-50', text: 'text-blue-700' },
		server: { bg: 'bg-indigo-50', text: 'text-indigo-700' },
		enclosure: { bg: 'bg-sky-50', text: 'text-sky-700' },
		ups: { bg: 'bg-amber-50', text: 'text-amber-700' },
		pdu: { bg: 'bg-orange-50', text: 'text-orange-700' },
		shelf: { bg: 'bg-gray-100', text: 'text-gray-600' },
		manager: { bg: 'bg-yellow-50', text: 'text-yellow-700' },
		'cable-mgmt': { bg: 'bg-yellow-50', text: 'text-yellow-700' },
		blanking: { bg: 'bg-gray-200/50', text: 'text-gray-400' },
		other: { bg: 'bg-gray-100', text: 'text-gray-500' },
		device: { bg: 'bg-indigo-50', text: 'text-indigo-600' },
	}

	const DEVICE_TYPE_LABELS: Record<string, string> = {
		switch: 'Switch',
		server: 'Server',
		manager: 'Cable Manager',
		enclosure: 'Fiber Enclosure',
		shelf: 'Shelf',
		pdu: 'PDU',
		'cable-mgmt': 'Cable Mgmt',
		blanking: 'Blanking',
		other: 'Device',
		device: 'Device',
	}

	function deviceColor(type: string) {
		return DEVICE_COLORS[type] ?? DEVICE_COLORS['device']
	}

	function deviceLabel(slot: FrameSlot) {
		const typeName = DEVICE_TYPE_LABELS[slot.type] ?? slot.type
		return slot.label ? `${typeName}: ${slot.label}` : typeName
	}

	// ── Drag-select state ──
	let containerEl: HTMLDivElement | undefined = $state()
	let dragStart: { x: number; y: number } | null = $state(null)
	let dragEnd: { x: number; y: number } | null = $state(null)
	let isDragging = $state(false)

	const MIN_DRAG = 4

	let rectStyle = $derived.by(() => {
		if (!dragStart || !dragEnd || !isDragging) return null
		const x = Math.min(dragStart.x, dragEnd.x)
		const y = Math.min(dragStart.y, dragEnd.y)
		const width = Math.abs(dragEnd.x - dragStart.x)
		const height = Math.abs(dragEnd.y - dragStart.y)
		if (width < MIN_DRAG && height < MIN_DRAG) return null
		return { x, y, width, height }
	})

	let dragPointerId: number | null = $state(null)

	function onPointerDown(e: PointerEvent) {
		// Only left button
		if (e.button !== 0) return
		if (!containerEl) return

		const rect = containerEl.getBoundingClientRect()
		const x = e.clientX - rect.left + containerEl.scrollLeft
		const y = e.clientY - rect.top + containerEl.scrollTop

		dragStart = { x, y }
		dragEnd = { x, y }
		isDragging = false
		dragPointerId = e.pointerId
		// Don't capture yet — let clicks through to PortCell buttons
	}

	function onPointerMove(e: PointerEvent) {
		if (!dragStart || !containerEl || e.pointerId !== dragPointerId) return

		const rect = containerEl.getBoundingClientRect()
		const x = e.clientX - rect.left + containerEl.scrollLeft
		const y = e.clientY - rect.top + containerEl.scrollTop
		dragEnd = { x, y }

		if (!isDragging) {
			const dx = Math.abs(x - dragStart.x)
			const dy = Math.abs(y - dragStart.y)
			if (dx >= MIN_DRAG || dy >= MIN_DRAG) {
				isDragging = true
				// Now capture pointer so drag continues even outside container
				containerEl.setPointerCapture(e.pointerId)
			}
		}
	}

	function onPointerUp(e: PointerEvent) {
		if (!containerEl || e.pointerId !== dragPointerId) { dragStart = null; return }
		if (isDragging) containerEl.releasePointerCapture(e.pointerId)

		if (isDragging && rectStyle) {
			// Compute intersection with port cells
			const containerRect = containerEl.getBoundingClientRect()
			const scrollLeft = containerEl.scrollLeft
			const scrollTop = containerEl.scrollTop

			// Convert selection rect to viewport coordinates
			const selLeft = rectStyle.x - scrollLeft + containerRect.left
			const selTop = rectStyle.y - scrollTop + containerRect.top
			const selRight = selLeft + rectStyle.width
			const selBottom = selTop + rectStyle.height

			const keys: string[] = []
			for (const el of containerEl.querySelectorAll('[data-port]')) {
				const r = el.getBoundingClientRect()
				if (r.right > selLeft && r.left < selRight &&
					r.bottom > selTop && r.top < selBottom) {
					const key = el.getAttribute('data-port')
					if (key) keys.push(key)
				}
			}

			if (keys.length > 0) {
				onblockselect?.(keys, e)
			}
		}

		dragStart = null
		dragEnd = null
		isDragging = false
	}
</script>

{#if visibleRacks.length === 0 && racks.length === 0}
	<div class="flex items-center justify-center h-64 text-gray-400 text-sm">
		Configure a zone and generate locations to see the patch frame
	</div>
{:else}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="space-y-6 relative select-none"
		class:cursor-crosshair={!isDragging}
		bind:this={containerEl}
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
	>
		{#if rectStyle}
			<SelectionRect x={rectStyle.x} y={rectStyle.y} width={rectStyle.width} height={rectStyle.height} />
		{/if}

		{#each visibleRacks as rack (rack.frame.id)}
			{@const ruMap = buildRUMap(rack)}
			{@const oppRUs = oppositePanelRUs?.get(rack.frame.id)}
			<div class="space-y-2">
				<!-- Frame header -->
				<div class="flex items-center gap-3">
					<div class="w-3 h-3 rounded-full {rack.frame.serverRoom === 'A' ? 'bg-blue-500' : rack.frame.serverRoom === 'B' ? 'bg-purple-500' : rack.frame.serverRoom === 'C' ? 'bg-teal-500' : 'bg-rose-500'}"></div>
					<h3 class="font-semibold text-sm uppercase tracking-wider text-gray-700">
						{rack.frame.name}
					</h3>
					<span class="text-xs text-gray-400">
						{rack.panels.length} panel{rack.panels.length !== 1 ? 's' : ''} / {rack.frame.totalRU}U frame
					</span>
				</div>

				<!-- Rack body -->
				<div class="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
					<!-- Column header -->
					<div class="flex items-center px-0.5 py-0.5 bg-gray-50 border-b border-gray-200">
						<span class="font-mono text-[7px] text-gray-400 w-8 text-center shrink-0">RU</span>
						<div class="grid grid-cols-24 gap-px flex-1">
							{#each Array(24) as _, i}
								<span class="font-mono text-[6px] text-gray-400 text-center">{i + 1}</span>
							{/each}
						</div>
					</div>

					{#each ruMap as item}
						{#if item.type === 'panel'}
							<PanelStrip
								panel={item.panel}
								frameId={rack.frame.id}
								{selectedLocations}
								{selectedPorts}
								{reservationMap}
								{onselect}
							/>
						{:else if item.type === 'slot'}
							{@const colors = deviceColor(item.slot.type)}
							<!-- Slot: device, blanking, cable mgmt -->
							<div class="border-b border-gray-200 last:border-b-0">
								<div class="flex items-stretch" style:height="{item.slot.height * 1.25}rem">
									<div class="w-8 bg-gray-100 flex flex-col items-center justify-between py-px border-r border-gray-200 shrink-0">
									{#each Array(item.slot.height) as _, h}
										<span class="font-mono text-[7px] text-gray-400">{item.slot.ru + item.slot.height - 1 - h}</span>
									{/each}
								</div>
									<div class="flex-1 flex items-center px-2 {colors.bg}">
										<span class="font-mono text-[9px] {colors.text}">
											{deviceLabel(item.slot)}
										</span>
									</div>
								</div>
							</div>
						{:else}
							<!-- Empty RU -->
							{@const hasOppPanel = oppRUs?.has(item.ru) ?? false}
							<div class="border-b border-gray-100 last:border-b-0">
								<div class="flex items-stretch xxh-3">
									<div class="w-8 bg-gray-50 flex items-center justify-center border-r border-gray-100 shrink-0">
										<span class="font-mono text-[7px] text-gray-300">{item.ru}</span>
									</div>
									{#if hasOppPanel}
										<div class="flex-1 bg-gray-100/60 flex items-center px-2 py-0">
											<span class="font-mono text-md text-gray-400 xxitalic">{frameFace === 'front' ? 'Rear' : 'Front'} panel</span>
										</div>
									{:else}
										<div class="flex-1"></div>
									{/if}
								</div>
							</div>
						{/if}
					{/each}
				</div>
			</div>
		{/each}
	</div>
{/if}
