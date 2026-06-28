<script lang="ts">
	import { Dialog, Button, Icon, Select, Input, Firestore } from '$lib'
	import type { ViewportSource } from '$lib/types/pages'
	import type { FloorConfig } from '$lib/types/project'

	/**
	 * Guided "Add Viewport" flow: pick a content TYPE, then bind its SOURCE with
	 * proper controls (floor/room/face selects, a real file picker, etc.) before
	 * the viewport is created — so a new viewport renders immediately instead of
	 * dropping in blank and forcing a hunt through the sidebar. Advanced per-kind
	 * tweaks (row ids, riser hidden-floors, survey photo id, outlet layers) stay
	 * editable in the sidebar after creation.
	 */
	let { open = $bindable(false), initialKind = null, db, projectId, floors, onadd }: {
		open?: boolean
		/** When set, skip the type step and go straight to the source step. */
		initialKind?: ViewportSource['kind'] | null
		db: Firestore
		projectId: string
		floors: FloorConfig[]
		onadd: (source: ViewportSource, label?: string) => void
	} = $props()

	const KINDS: { kind: ViewportSource['kind']; label: string }[] = [
		{ kind: 'rack-elevation', label: 'Rack Elevation' },
		{ kind: 'rack-plan',      label: 'Rack Plan' },
		{ kind: 'frame-detail',   label: 'Frame Detail' },
		{ kind: 'floorplan',      label: 'Floorplan' },
		{ kind: 'outlets',        label: 'Outlets / Trunks' },
		{ kind: 'patching',       label: 'Patching' },
		{ kind: 'risers',         label: 'Risers' },
		{ kind: 'survey',         label: 'Photo Survey' },
		{ kind: 'fillrate',       label: 'Fill Rate' },
		{ kind: 'text',           label: 'Text' },
		{ kind: 'image',          label: 'Image' },
	]

	let step = $state<'type' | 'source'>('type')
	let kind = $state<ViewportSource['kind'] | null>(null)
	let label = $state('')

	// Source-binding fields (superset; only the relevant ones show per kind).
	let floor = $state(1)
	let room = $state('A')
	let face = $state<'front' | 'rear'>('front')
	let rowId = $state('')
	let frameId = $state('')
	let fileId = $state('')
	let pageNum = $state(1)
	let showOutlets = $state(true)
	let showTrunks = $state(true)
	let surveyId = $state('')
	let surveyMode = $state<'album' | 'single'>('album')
	let text = $state('Note')
	let url = $state('')
	let risersDocId = $state('')

	// Reset whenever the dialog transitions closed → open.
	let prevOpen = false
	$effect(() => {
		if (open && !prevOpen) resetState()
		prevOpen = open
	})

	function resetState() {
		label = ''
		floor = floors[0]?.number ?? 1
		room = 'A'
		face = 'front'
		rowId = ''
		frameId = ''
		fileId = files[0]?.id ?? ''
		pageNum = 1
		showOutlets = true
		showTrunks = true
		surveyId = ''
		surveyMode = 'album'
		text = 'Note'
		url = ''
		risersDocId = projectId
		if (initialKind) { kind = initialKind; step = 'source' }
		else { kind = null; step = 'type' }
	}

	// Uploaded files for the floorplan picker.
	type FileDoc = { id: string; name?: string; pageCount?: number; projectId?: string }
	let files = $state<FileDoc[]>([])
	$effect(() => {
		const unsub = db.subscribeMany('files', docs => {
			files = (docs as unknown as FileDoc[])
				.filter(f => !f.projectId || f.projectId === projectId)
				.sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id))
		})
		return () => unsub?.()
	})

	// Riser drawings for this project (the legacy doc id === projectId is the default).
	type RiserDrawing = { id: string; name?: string }
	let riserDrawings = $state<RiserDrawing[]>([])
	$effect(() => {
		const unsub = db.subscribeWhere('risers', 'projectId', projectId, (docs) => {
			riserDrawings = (docs as unknown as RiserDrawing[])
				.map((d) => ({ id: d.id, name: d.name }))
				.sort((a, b) => (a.id === projectId ? -1 : b.id === projectId ? 1 : (a.name ?? '').localeCompare(b.name ?? '')))
		})
		return () => unsub?.()
	})
	const riserName = (d: RiserDrawing) => d.name?.trim() || (d.id === projectId ? 'Default' : d.id.slice(0, 8))

	const pad = (n: number) => String(n).padStart(2, '0')
	const rackDocId = (fl: number, rm: string) => `${projectId}_F${pad(fl)}_R${rm}`
	let availableRooms = $derived(['A', 'B', 'C', 'D'].slice(0, floors.find(f => f.number === floor)?.serverRoomCount ?? 1))

	function chooseKind(k: ViewportSource['kind']) {
		kind = k
		step = 'source'
	}

	function buildSource(): ViewportSource | null {
		switch (kind) {
			case 'rack-elevation': return { kind, rackDocId: rackDocId(floor, room), face, ...(rowId.trim() ? { rowId: rowId.trim() } : {}) }
			case 'rack-plan':      return { kind, rackDocId: rackDocId(floor, room) }
			case 'frame-detail':   return { kind, frameDocId: `${projectId}_F${pad(floor)}`, frameId: frameId.trim() }
			case 'fillrate':       return { kind, projectId }
			case 'floorplan':      return { kind, fileId, pageNum: pageNum || 1 }
			case 'outlets':        return { kind, outletsDocId: `${projectId}_F${pad(floor)}`, showOutlets, showTrunks }
			case 'patching':       return { kind, patchDocId: rackDocId(floor, room) }
			case 'risers':         return { kind, risersDocId: risersDocId || projectId }
			case 'survey':         return { kind, surveyId: surveyId.trim(), mode: surveyMode }
			case 'text':           return { kind, content: text }
			case 'image':          return { kind, url: url.trim() }
			default:               return null
		}
	}

	function confirmAdd() {
		const source = buildSource()
		if (!source) return
		onadd(source, label.trim() || undefined)
		open = false
	}

	const inputNum = (e: Event) => Number((e.currentTarget as HTMLInputElement).value)
	const inputVal = (e: Event) => (e.currentTarget as HTMLInputElement).value
</script>

<Dialog bind:open title="Add Viewport">
	{#if step === 'type'}
		<p class="text-xs text-zinc-500 mb-2">Choose the kind of content to place on the page.</p>
		<div class="grid grid-cols-2 gap-1.5">
			{#each KINDS as k (k.kind)}
				<button
					class="px-2 py-1.5 text-xs rounded border border-zinc-200 hover:border-blue-400 hover:bg-blue-50 text-left"
					onclick={() => chooseKind(k.kind)}>
					{k.label}
				</button>
			{/each}
		</div>
	{:else if kind}
		<div class="space-y-3">
			<div class="text-xs text-zinc-500">
				Type: <span class="font-medium text-zinc-700">{KINDS.find(k => k.kind === kind)?.label}</span>
				{#if !initialKind}
					<button class="ml-2 text-blue-600 hover:underline" onclick={() => step = 'type'}>change</button>
				{/if}
			</div>

			{#if kind === 'rack-elevation'}
				<div class="grid grid-cols-3 gap-2">
					<Select label="Floor" size="sm" value={String(floor)} onchange={(e: Event) => floor = inputNum(e)}>
						{#each floors as fl (fl.number)}<option value={String(fl.number)}>{fl.number}F</option>{/each}
					</Select>
					<Select label="Room" size="sm" value={room} onchange={(e: Event) => room = inputVal(e)}>
						{#each availableRooms as r (r)}<option value={r}>{r}</option>{/each}
					</Select>
					<Select label="Face" size="sm" value={face} onchange={(e: Event) => face = inputVal(e) as 'front' | 'rear'}>
						<option value="front">Front</option>
						<option value="rear">Rear</option>
					</Select>
				</div>
				<Input label="Row id (optional — empty = all rows)" size="sm" value={rowId} onchange={(e: Event) => rowId = inputVal(e)} />

			{:else if kind === 'rack-plan' || kind === 'patching'}
				<div class="grid grid-cols-2 gap-2">
					<Select label="Floor" size="sm" value={String(floor)} onchange={(e: Event) => floor = inputNum(e)}>
						{#each floors as fl (fl.number)}<option value={String(fl.number)}>{fl.number}F</option>{/each}
					</Select>
					<Select label="Room" size="sm" value={room} onchange={(e: Event) => room = inputVal(e)}>
						{#each availableRooms as r (r)}<option value={r}>{r}</option>{/each}
					</Select>
				</div>

			{:else if kind === 'frame-detail'}
				<Select label="Floor" size="sm" value={String(floor)} onchange={(e: Event) => floor = inputNum(e)}>
					{#each floors as fl (fl.number)}<option value={String(fl.number)}>{fl.number}F</option>{/each}
				</Select>
				<Input label="Frame ID" size="sm" value={frameId} placeholder="e.g. frame-A1" onchange={(e: Event) => frameId = inputVal(e)} />

			{:else if kind === 'floorplan'}
				{#if files.length}
					<Select label="File" size="sm" value={fileId} onchange={(e: Event) => fileId = inputVal(e)}>
						{#each files as f (f.id)}<option value={f.id}>{f.name ?? f.id}</option>{/each}
					</Select>
				{:else}
					<div class="text-[11px] text-amber-600">No uploaded files in this project yet — upload a floorplan first.</div>
				{/if}
				<Input label="Page" type="number" size="sm" value={String(pageNum)} onchange={(e: Event) => pageNum = inputNum(e) || 1} />

			{:else if kind === 'outlets'}
				<Select label="Floor" size="sm" value={String(floor)} onchange={(e: Event) => floor = inputNum(e)}>
					{#each floors as fl (fl.number)}<option value={String(fl.number)}>{fl.number}F</option>{/each}
				</Select>
				<div class="flex items-center gap-4 text-xs text-zinc-600">
					<label class="flex items-center gap-1.5"><input type="checkbox" class="accent-blue-600" bind:checked={showOutlets} /> Outlets</label>
					<label class="flex items-center gap-1.5"><input type="checkbox" class="accent-blue-600" bind:checked={showTrunks} /> Trunks</label>
				</div>

			{:else if kind === 'survey'}
				<Input label="Survey ID" size="sm" value={surveyId} placeholder="surveys/<id>" onchange={(e: Event) => surveyId = inputVal(e)} />
				<Select label="Mode" size="sm" value={surveyMode} onchange={(e: Event) => surveyMode = inputVal(e) as 'album' | 'single'}>
					<option value="album">Album grid</option>
					<option value="single">Single photo</option>
				</Select>

			{:else if kind === 'text'}
				<label class="block">
					<div class="text-[10px] uppercase tracking-wider text-zinc-400 mb-0.5">Text</div>
					<textarea class="w-full border border-zinc-200 rounded px-1.5 py-1 text-xs min-h-16 resize-y" bind:value={text}></textarea>
				</label>

			{:else if kind === 'image'}
				<Input label="Image URL" size="sm" value={url} placeholder="https://…" onchange={(e: Event) => url = inputVal(e)} />

			{:else if kind === 'fillrate'}
				<div class="text-[11px] text-zinc-500">Shows this project's fill-rate diagram. No further options.</div>

			{:else if kind === 'risers'}
				{#if riserDrawings.length > 1}
					<Select label="Drawing" size="sm" value={risersDocId} onchange={(e: Event) => risersDocId = inputVal(e)}>
						{#each riserDrawings as d (d.id)}<option value={d.id}>{riserName(d)}</option>{/each}
					</Select>
				{/if}
				<div class="text-[11px] text-zinc-500">Adds a risers elevation for the whole building. Adjust floor range in the sidebar after adding.</div>
			{/if}

			<Input label="Label (optional)" size="sm" value={label} onchange={(e: Event) => label = inputVal(e)} />

			<div class="flex items-center justify-end gap-2 pt-1">
				{#if !initialKind}
					<Button variant="ghost" onclick={() => step = 'type'}><Icon name="chevronLeft" size={12} /> Back</Button>
				{/if}
				<Button variant="primary" onclick={confirmAdd}><Icon name="plus" size={12} /> Add viewport</Button>
			</div>
		</div>
	{/if}
</Dialog>
