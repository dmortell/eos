<script lang="ts">
	import { Button, Icon, Titlebar } from '$lib'
	import { PaneGroup, Pane, Handle } from '$lib/components/ui/resizable'
	import type { ChangeDetail } from '$lib/logger'
	import type { Section as SectionType } from './parts/constants'
	import { createSection, formatLabel, calcFillRate, fillColor } from './parts/constants'
	import SectionEditor from './parts/SectionEditor.svelte'
	import SectionCanvas from './parts/SectionCanvas.svelte'

	let { data = null, projectId = '', projectName = '', onsave }: {
		data?: any
		projectId?: string
		projectName?: string
		onsave?: (payload: any, changes: ChangeDetail[]) => void
	} = $props()

	// ── State ──
	let sections = $state<SectionType[]>(data?.sections ?? [])
	let nextLabel = $state<number>(data?.nextLabel ?? 1)
	let selectedId = $state<string | null>(null)
	let saveStatus = $state<'saved' | 'saving' | 'unsaved'>('saved')

	let selected = $derived(sections.find(s => s.id === selectedId) ?? null)
	let selectedIndex = $derived(selectedId ? sections.findIndex(s => s.id === selectedId) : -1)

	// Auto-scroll to selected section card
	$effect(() => {
		if (!selectedId) return
		const el = document.getElementById(`section-${selectedId}`)
		el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
	})

	// ── Sync from remote ──
	let syncPaused = $state(false)
	let syncTimer: ReturnType<typeof setTimeout> | null = null

	function pauseSync() {
		syncPaused = true
		if (syncTimer) clearTimeout(syncTimer)
		syncTimer = setTimeout(() => { syncPaused = false }, 1500)
	}

	$effect(() => {
		const d = data
		if (syncPaused || saveStatus !== 'saved' || !d) return
		if (d.sections) sections = d.sections
		if (d.nextLabel != null) nextLabel = d.nextLabel
	})

	// ── Auto-save ──
	let saveTimer: ReturnType<typeof setTimeout> | null = null
	let pendingChanges: ChangeDetail[] = []

	function scheduleSave() {
		saveStatus = 'unsaved'
		syncPaused = true
		if (saveTimer) clearTimeout(saveTimer)
		saveTimer = setTimeout(doSave, 500)
	}

	function doSave() {
		saveStatus = 'saving'
		const payload = { sections, nextLabel }
		onsave?.(payload, pendingChanges)
		pendingChanges = []
		pauseSync()
		saveStatus = 'saved'
	}

	function logChange(action: string, field?: string, details?: string) {
		pendingChanges.push({ action, field, details })
		scheduleSave()
	}

	// ── Section CRUD ──
	function addSection() {
		const label = formatLabel(nextLabel)
		const s = createSection(label)
		sections = [...sections, s]
		nextLabel++
		selectedId = s.id
		logChange('add', 'section', label)
	}

	function deleteSection(id: string) {
		const s = sections.find(s => s.id === id)
		sections = sections.filter(s => s.id !== id)
		if (selectedId === id) selectedId = sections[0]?.id ?? null
		logChange('delete', 'section', s?.label)
	}

	function moveSection(dir: -1 | 1) {
		if (!selectedId) return
		const idx = sections.findIndex(s => s.id === selectedId)
		const newIdx = idx + dir
		if (newIdx < 0 || newIdx >= sections.length) return
		const arr = [...sections]
		;[arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]]
		sections = arr
		logChange('reorder', 'section', sections[newIdx]?.label)
	}
</script>

<main class="h-dvh flex flex-col print:h-auto overflow-hidden">

	<Titlebar title="{projectName} — Fill Rate" />

	<PaneGroup direction="horizontal" class="flex-1 min-h-0">
		<!-- Sidebar -->
		<Pane defaultSize={22} minSize={15} maxSize={40}>
		<div class="h-full border-r border-gray-300 flex flex-col bg-white print:hidden">
			<div class="flex items-center gap-1 px-2 py-1 border-b border-gray-200 bg-gray-50">
				<Button icon="plus" variant="primary" class="rounded px-2 py-1 text-xs" title="Add Container" onclick={addSection}>Add</Button>
				<Button icon="trash" class="rounded px-1 py-1 text-xs" title="Delete Container" onclick={() => { if (selectedId) deleteSection(selectedId) }}
					disabled={!selectedId} />
				<div class="flex-1"></div>
				<Button icon="print" class="rounded px-2 py-1 text-xs" title="Print Preview" onclick={() => window.print()} />
				<span class="text-[10px] font-mono ml-1 {saveStatus === 'saved' ? 'text-green-500' : saveStatus === 'saving' ? 'text-blue-500' : 'text-orange-500'}">
					{saveStatus === 'saved' ? 'Saved' : saveStatus === 'saving' ? 'Saving...' : 'Unsaved'}
				</span>
			</div>

			<!-- Section list -->
			<div class="overflow-y-auto flex-1">
				{#if sections.length === 0}
					<div class="p-4 text-sm text-gray-400 text-center">No sections</div>
				{:else}
					{#each sections as section (section.id)}
						<button class="w-full text-left px-3 py-1.5 text-sm border-b border-gray-100 hover:bg-blue-50
							{section.id === selectedId ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''}"
							onclick={() => { selectedId = section.id }}>
							<div class="flex items-center justify-between">
								<span class="font-mono font-bold text-xs">{section.label}</span>
								<span class="text-[10px] {fillColor(calcFillRate(section))}">{calcFillRate(section).toFixed(0)}%</span>
							</div>
							<div class="text-[10px] text-gray-500">
								{section.containmentType === 'round' ? `Ø${section.diameter}mm` : `${section.width}×${section.height}mm`}
								· {section.cables.reduce((s, c) => s + c.quantity, 0)} cables
							</div>
						</button>
					{/each}
				{/if}
			</div>

			<!-- Editor for selected section -->
			{#if selected}
				<div class="border-t border-gray-300 overflow-y-auto" style="max-height: 50%">
					<SectionEditor section={selected}
						canMoveUp={selectedIndex > 0}
						canMoveDown={selectedIndex < sections.length - 1}
						onchange={() => logChange('edit', 'section', selected?.label)}
						onmoveup={() => moveSection(-1)}
						onmovedown={() => moveSection(1)} />
				</div>
			{/if}
		</div>
		</Pane>

		<Handle withHandle />

		<!-- Main content: section drawings -->
		<Pane defaultSize={78}>
		<div class="h-full overflow-auto p-4 bg-gray-50 print:bg-white print:p-0">
			{#if sections.length === 0}
				<div class="flex flex-col items-center justify-center h-full text-gray-400">
					<Icon name="cable" size={48} />
					<div class="mt-2 text-lg">No sections yet</div>
					<div class="text-sm">Click "Add" to create a fill rate cross-section</div>
				</div>
			{:else}
				<div class="hidden print:block text-lg font-bold mb-2 px-2">{projectName} — Containment Fill Rates</div>
				<div class="flex flex-wrap gap-4 print:gap-8">
					{#each sections as section (section.id)}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div id="section-{section.id}" class="bg-white border rounded-lg overflow-hidden print:break-inside-avoid print:border-gray-300
							{section.id === selectedId ? 'ring-2 ring-blue-400' : 'border-gray-200'}"
							onclick={() => { selectedId = section.id }}>
							<div class="px-3 py-1 text-xs font-mono font-bold bg-gray-50 border-b border-gray-100">{section.label}</div>
							<SectionCanvas {section} size={350} />
							<div class="px-3 py-1 border-t border-gray-100 text-[11px] text-gray-600">
								<span>Cables:</span>
								{#each section.cables as cable}
									<span class="mr-2">{cable.quantity} &times; {cable.diameter}mm</span>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
		</Pane>
	</PaneGroup>
</main>

<style>
	@media print {
		@page { size: A3 landscape; margin: 10mm; }
	}
</style>
