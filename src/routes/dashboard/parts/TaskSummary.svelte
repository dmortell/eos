<script lang="ts">
	import type { Task } from '$lib/types/task';

	let { tasks = [] }: { tasks: Task[] } = $props();

	let counts = $derived.by(() => {
		const result = { pending: 0, inProgress: 0, review: 0, done: 0 };
		for (const task of tasks) {
			if (task.status === 'done') result.done += 1;
			else if (task.status === 'in-progress') result.inProgress += 1;
			else if (task.status === 'review') result.review += 1;
			else result.pending += 1;
		}
		return result;
	});
</script>

<div class="grid grid-cols-2 md:grid-cols-4 gap-2">
	<div class="border rounded-md bg-gray-50 p-2">
		<div class="text-xs text-gray-600">Pending</div>
		<div class="text-lg font-semibold leading-tight">{counts.pending}</div>
	</div>
	<div class="border rounded-md bg-amber-50 p-2">
		<div class="text-xs text-gray-600">In Progress</div>
		<div class="text-lg font-semibold leading-tight">{counts.inProgress}</div>
	</div>
	<div class="border rounded-md bg-violet-50 p-2">
		<div class="text-xs text-gray-600">Review</div>
		<div class="text-lg font-semibold leading-tight">{counts.review}</div>
	</div>
	<div class="border rounded-md bg-emerald-50 p-2">
		<div class="text-xs text-gray-600">Done</div>
		<div class="text-lg font-semibold leading-tight">{counts.done}</div>
	</div>
</div>
