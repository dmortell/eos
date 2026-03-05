<script lang="ts">
	import { Button } from '$lib'
	import { DEFAULT_LOC_TYPES } from './types'

	let { open = false, customTypes, rooms, excelGroupByRoom = false, floorFormat = 'L01', onclose, onupdate }: {
		open: boolean
		customTypes: string[]
		rooms: { roomNumber: string; roomName: string }[]
		excelGroupByRoom?: boolean
		floorFormat?: string
		onclose: () => void
		onupdate: (data: { customTypes: string[]; rooms: { roomNumber: string; roomName: string }[]; excelGroupByRoom: boolean; floorFormat: string }) => void
	} = $props()

	let newType = $state('')
	let newRoomNumber = $state('')
	let newRoomName = $state('')

	function emit() {
		onupdate({ customTypes, rooms, excelGroupByRoom, floorFormat })
	}

	function addType() {
		const t = newType.trim().toUpperCase()
		if (!t || customTypes.includes(t) || (DEFAULT_LOC_TYPES as readonly string[]).includes(t)) return
		customTypes = [...customTypes, t]
		newType = ''
		emit()
	}

	function removeType(t: string) {
		customTypes = customTypes.filter(x => x !== t)
		emit()
	}

	function addRoom() {
		const num = newRoomNumber.trim()
		const name = newRoomName.trim()
		if (!num) return
		if (rooms.find(r => r.roomNumber === num)) return
		rooms = [...rooms, { roomNumber: num, roomName: name }]
		newRoomNumber = ''
		newRoomName = ''
		emit()
	}

	function removeRoom(num: string) {
		rooms = rooms.filter(r => r.roomNumber !== num)
		emit()
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onclick={onclose} onkeydown={e => e.key === 'Escape' && onclose()}>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="bg-white rounded-lg shadow-xl border border-gray-200 w-[500px] max-h-[80vh] overflow-y-auto" onclick={e => e.stopPropagation()}>
			<div class="flex items-center justify-between p-4 border-b border-gray-200">
				<h2 class="font-semibold text-sm">Settings</h2>
				<button class="text-gray-400 hover:text-gray-600 text-lg" onclick={onclose}>&times;</button>
			</div>

			<div class="p-4 space-y-5">
				<!-- Custom Location Types -->
				<div class="space-y-2">
					<h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Custom Location Types</h3>
					<p class="text-[10px] text-gray-400">Built-in: {[...DEFAULT_LOC_TYPES].join(', ')}</p>

					<div class="flex gap-1 flex-wrap">
						{#each customTypes as t}
							<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded text-xs font-mono">
								{t}
								<button class="text-red-400 hover:text-red-600" onclick={() => removeType(t)}>&times;</button>
							</span>
						{/each}
					</div>

					<div class="flex gap-1">
						<input
							type="text"
							bind:value={newType}
							placeholder="e.g. CAM"
							maxlength="4"
							class="flex-1 h-7 px-2 text-xs font-mono bg-white border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
							onkeydown={e => e.key === 'Enter' && addType()}
						/>
						<Button onclick={addType}>Add</Button>
					</div>
				</div>

				<!-- Room Directory -->
				<div class="space-y-2">
					<h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Room Directory</h3>

					{#if rooms.length > 0}
						<div class="space-y-0.5 max-h-40 overflow-y-auto">
							{#each rooms as room}
								<div class="flex items-center gap-2 text-xs font-mono bg-gray-50 px-2 py-1 rounded">
									<span class="w-12 font-semibold">{room.roomNumber}</span>
									<span class="flex-1 text-gray-500">{room.roomName || '(unnamed)'}</span>
									<button class="text-red-400 hover:text-red-600" onclick={() => removeRoom(room.roomNumber)}>&times;</button>
								</div>
							{/each}
						</div>
					{/if}

					<div class="flex gap-1">
						<input
							type="text"
							bind:value={newRoomNumber}
							placeholder="Number"
							maxlength="4"
							class="w-16 h-7 px-2 text-xs font-mono bg-white border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
							onkeydown={e => e.key === 'Enter' && addRoom()}
						/>
						<input
							type="text"
							bind:value={newRoomName}
							placeholder="Room name"
							class="flex-1 h-7 px-2 text-xs bg-white border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
							onkeydown={e => e.key === 'Enter' && addRoom()}
						/>
						<Button onclick={addRoom}>Add</Button>
					</div>
				</div>

				<!-- Floor/Level Format -->
				<div class="space-y-2">
					<h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Floor / Level Format</h3>
					<p class="text-[10px] text-gray-400">How floor numbers appear in labels, tabs, and exports</p>
					<div class="flex gap-1">
						{#each [{ value: 'L01', label: 'L01', example: 'L01, L02' }, { value: '01F', label: '01F', example: '01F, 02F' }, { value: '01', label: '01', example: '01, 02' }] as opt}
							<button
								class="flex-1 h-8 rounded border text-xs font-mono transition-colors
									{floorFormat === opt.value ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}"
								onclick={() => { floorFormat = opt.value; emit() }}
							>
								<div>{opt.label}</div>
							</button>
						{/each}
					</div>
					<p class="text-[10px] text-gray-400">Preview: {floorFormat === '01F' ? '01F, 02F, 03F' : floorFormat === '01' ? '01, 02, 03' : 'L01, L02, L03'}</p>
				</div>

				<!-- Excel Export -->
				<div class="space-y-2">
					<h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Excel Export</h3>
					<label class="flex items-center gap-2 cursor-pointer">
						<input
							type="checkbox"
							checked={excelGroupByRoom}
							onchange={() => { excelGroupByRoom = !excelGroupByRoom; emit() }}
							class="w-4 h-4 rounded"
						/>
						<span class="text-xs text-gray-600">Group all frames of same server room into one tab</span>
					</label>
					<p class="text-[10px] text-gray-400">
						{excelGroupByRoom
							? 'Each Excel tab will contain all frames for one server room'
							: 'Each frame gets its own Excel tab'}
					</p>
				</div>
			</div>
		</div>
	</div>
{/if}
