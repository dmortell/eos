<script lang="ts">
	import type { Task } from '$lib/types/task';

	let { tasks = [] }: { tasks: Task[] } = $props();

	let rows = $derived.by(() => {
		const grouped = new Map<string, { name: string; pending: number; inProgress: number; review: number; done: number }>();
		for (const task of tasks) {
			const key = task.assignedTo || 'unassigned';
			if (!grouped.has(key)) {
				grouped.set(key, {
					name: task.assignedToName || (key === 'unassigned' ? '(Unassigned)' : key),
					pending: 0,
					inProgress: 0,
					review: 0,
					done: 0
				});
			}
			const row = grouped.get(key)!;
			if (task.status === 'done') row.done += 1;
			else if (task.status === 'in-progress') row.inProgress += 1;
			else if (task.status === 'review') row.review += 1;
			else row.pending += 1;
		}
		return Array.from(grouped.values()).sort((a, b) => (b.pending + b.inProgress + b.review) - (a.pending + a.inProgress + a.review));
	});
</script>

<div class="border rounded-md bg-white overflow-x-auto">
	<table class="w-full text-xs">
		<thead class="bg-gray-50 text-gray-600">
			<tr>
				<th class="text-left px-2 py-1">User</th>
				<th class="text-right px-2 py-1">Pending</th>
				<th class="text-right px-2 py-1">In Progress</th>
				<th class="text-right px-2 py-1">Review</th>
				<th class="text-right px-2 py-1">Done</th>
			</tr>
		</thead>
		<tbody>
			{#if rows.length === 0}
				<tr><td class="px-2 py-2 text-gray-500" colspan="5">No tasks</td></tr>
			{:else}
				{#each rows as row}
					<tr class="border-t">
						<td class="px-2 py-1">{row.name}</td>
						<td class="px-2 py-1 text-right">{row.pending}</td>
						<td class="px-2 py-1 text-right">{row.inProgress}</td>
						<td class="px-2 py-1 text-right">{row.review}</td>
						<td class="px-2 py-1 text-right">{row.done}</td>
					</tr>
				{/each}
			{/if}
		</tbody>
	</table>
</div>
