<script lang="ts">
	import { Firestore } from '$lib'
	import { fetchLogs, formatChange, type LogEntry } from '$lib/logger'
	import { formatFloor } from './engine'

	let { open = false, projectId, floorFormat = 'L01', onclose }: {
		open: boolean
		projectId: string
		floorFormat?: string
		onclose: () => void
	} = $props()

	let db = new Firestore()
	let logs = $state<LogEntry[]>([])
	let loading = $state(false)
	let error = $state<string | null>(null)
	let userNames = $state<Record<string, string>>({})

	$effect(() => {
		if (open && projectId) loadLogs()
	})

	async function loadLogs() {
		loading = true
		error = null
		try {
			logs = await fetchLogs(projectId, 'frames', 100)
			// Resolve unique uids to display names
			const uids = [...new Set(logs.map(l => l.uid).filter(u => u && u !== 'unknown'))]
			const missing = uids.filter(u => !userNames[u])
			const resolved = await Promise.all(missing.map(async uid => {
				const user = await db.getOne('users', uid)
				return { uid, name: (user?.displayName as string) ?? null }
			}))
			const names = { ...userNames }
			for (const { uid, name } of resolved) {
				if (name) names[uid] = name
			}
			userNames = names
		} catch (e: any) {
			error = e.message ?? 'Failed to load logs'
		}
		loading = false
	}

	function formatTimestamp(ts: any): string {
		if (!ts?.toDate) return ''
		const d: Date = ts.toDate()
		return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
			' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
	}

	function displayName(uid: string): string {
		if (!uid || uid === 'unknown') return uid
		return userNames[uid] ?? uid.slice(0, 8)
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onclick={onclose} onkeydown={e => e.key === 'Escape' && onclose()}>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="bg-white rounded-lg shadow-xl border border-gray-200 w-[640px] max-h-[80vh] flex flex-col" onclick={e => e.stopPropagation()}>
			<div class="flex items-center justify-between p-3 border-b border-gray-200">
				<h3 class="text-sm font-semibold text-gray-700">Change Log</h3>
				<div class="flex items-center gap-2">
					<button class="text-[10px] text-blue-500 hover:underline" onclick={loadLogs}>Refresh</button>
					<button class="text-gray-400 hover:text-gray-600 text-lg leading-none" onclick={onclose}>&times;</button>
				</div>
			</div>

			<div class="flex-1 overflow-y-auto p-3">
				{#if loading}
					<div class="text-center text-gray-400 text-sm py-8">Loading...</div>
				{:else if error}
					<div class="text-center text-red-500 text-sm py-8">{error}</div>
				{:else if logs.length === 0}
					<div class="text-center text-gray-400 text-sm py-8">No logs yet</div>
				{:else}
					<div class="space-y-0.5 font-mono text-[11px]">
						{#each logs as log}
							<div class="py-1 border-b border-gray-100 last:border-b-0">
								<div class="flex items-baseline gap-2">
									<span class="text-gray-400 shrink-0">{formatTimestamp(log.timestamp)}</span>
									{#if log.floor}
										<span class="text-blue-500 shrink-0">{formatFloor(log.floor, floorFormat)}</span>
									{/if}
									<span class="text-purple-400 shrink-0" title={log.uid}>{displayName(log.uid)}</span>
								</div>
								<div class="pl-4 text-gray-600">
									{#each log.changes as change}
										<div>{formatChange(change)}</div>
									{/each}
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
