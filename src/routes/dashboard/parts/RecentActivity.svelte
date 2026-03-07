<script lang="ts">
	import type { Task } from '$lib/types/task';

	let { tasks = [] }: { tasks: Task[] } = $props();

	function toMillis(value: unknown): number {
		if (!value) return 0;
		if (typeof value === 'number') return value;
		if (value instanceof Date) return value.getTime();
		if (typeof value === 'object' && value && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
			return (value as { toDate: () => Date }).toDate().getTime();
		}
		return 0;
	}

	function ago(value: unknown): string {
		const ms = Date.now() - toMillis(value);
		if (ms <= 0) return 'just now';
		const min = Math.floor(ms / 60000);
		if (min < 1) return 'just now';
		if (min < 60) return `${min}m ago`;
		const hr = Math.floor(min / 60);
		if (hr < 24) return `${hr}h ago`;
		const day = Math.floor(hr / 24);
		return `${day}d ago`;
	}

	let recent = $derived.by(() =>
		[...tasks]
			.sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt))
			.slice(0, 12)
	);
</script>

<div class="border rounded-md bg-white divide-y">
	{#if recent.length === 0}
		<div class="px-2 py-2 text-xs text-gray-500">No recent task activity</div>
	{:else}
		{#each recent as task}
			<div class="px-2 py-1 text-xs flex items-center justify-between gap-2">
				<div class="truncate">
					<span class="font-medium">{task.assignedToName || task.createdByName || 'User'}</span>
					<span class="text-gray-600"> updated </span>
					<span class="font-medium">{task.title || '(untitled task)'}</span>
					<span class="text-gray-500"> in {task.status}</span>
				</div>
				<div class="text-xs text-gray-500 shrink-0">{ago(task.updatedAt || task.createdAt)}</div>
			</div>
		{/each}
	{/if}
</div>
