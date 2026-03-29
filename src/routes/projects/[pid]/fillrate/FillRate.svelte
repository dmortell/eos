<script lang="ts">
	import { Button, Icon, Titlebar } from '$lib'
	import type { ChangeDetail } from '$lib/logger'
	import type { Section as SectionType } from './parts/constants'
	import { createSection, formatLabel } from './parts/constants'
	import SectionCard from './parts/Section.svelte'

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
		logChange('reorder', 'section', sections[idx]?.label)
	}

	let selectedIndex = $derived(selectedId ? sections.findIndex(s => s.id === selectedId) : -1)
</script>

<main class="h-dvh flex flex-col">
	<Titlebar title="{projectName} — Fill Rate" />

	<div class="flex items-center gap-1 px-2 py-1 border-b border-gray-300 bg-gray-50 text-sm print:hidden">
		<Button icon="plus" variant="primary" class="rounded px-2 py-1" onclick={addSection}>Add Section</Button>
		<Button icon="trash" class="rounded px-2 py-1" onclick={() => { if (selectedId) deleteSection(selectedId) }}
			disabled={!selectedId}>Delete</Button>
		<div class="w-px h-5 bg-gray-300 mx-1"></div>
		<Button icon="chevronUp" class="rounded px-1 py-1" onclick={() => moveSection(-1)}
			disabled={!selectedId || selectedIndex <= 0} />
		<Button icon="chevronDown" class="rounded px-1 py-1" onclick={() => moveSection(1)}
			disabled={!selectedId || selectedIndex >= sections.length - 1} />
		<div class="flex-1"></div>
		<Button icon="print" class="rounded px-2 py-1" onclick={() => window.print()}>Print</Button>
		<span class="text-[10px] font-mono ml-2 {saveStatus === 'saved' ? 'text-green-500' : saveStatus === 'saving' ? 'text-blue-500' : 'text-orange-500'}">
			{saveStatus === 'saved' ? 'Saved' : saveStatus === 'saving' ? 'Saving...' : 'Unsaved'}
		</span>
	</div>

	<div class="flex-1 overflow-auto p-4">
		{#if sections.length === 0}
			<div class="flex flex-col items-center justify-center h-full text-gray-400">
				<Icon name="cable" size={48} />
				<div class="mt-2 text-lg">No sections yet</div>
				<div class="text-sm">Click "Add Section" to create a fill rate cross-section</div>
			</div>
		{:else}
			<div class="space-y-4 max-w-4xl mx-auto print:max-w-none">
				<div class="hidden print:block text-lg font-bold mb-4">{projectName} — Fill Rate Calculations</div>
				{#each sections as section (section.id)}
					<div class="print:break-inside-avoid">
						<SectionCard
							{section}
							selected={section.id === selectedId}
							onchange={() => logChange('edit', 'section', section.label)}
							onselect={() => { selectedId = section.id }}
							ondelete={() => deleteSection(section.id)}
						/>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</main>
