<script lang="ts">
	import type { Task, TaskStatus } from '$lib/types/task';
	import TaskCard from './TaskCard.svelte';
	import { Button } from '$lib';

	let {
		status,
		title,
		color,
		tasks,
		onTaskClick,
		onTaskDelete,
		onDrop,
		onAddTask,
		onDragStart,
		onDragEnd
	}: {
		status: TaskStatus;
		title: string;
		color: string;
		tasks: Task[];
		onTaskClick: (task: Task) => void;
		onTaskDelete: (task: Task) => void;
		onDrop: (status: TaskStatus) => void;
		onAddTask: (status: TaskStatus) => void;
		onDragStart: (task: Task) => void;
		onDragEnd: () => void;
	} = $props();

	let over = $state(false);

	function allowDrop(event: DragEvent) {
		event.preventDefault();
		over = true;
	}

	function leaveDrop() {
		over = false;
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		over = false;
		onDrop(status);
	}
</script>

<div
	class={`w-full min-w-0 max-h-[calc(100vh-9rem)] border rounded-md p-1.5 flex flex-col ${color} ${over ? 'ring-2 ring-blue-400' : ''}`}
	role="group"
	ondragover={allowDrop}
	ondragenter={allowDrop}
	ondragleave={leaveDrop}
	ondrop={handleDrop}
>
	<div class="flex items-center justify-between mb-1">
		<div class="font-semibold text-sm">{title} <span class="text-xs text-gray-600">({tasks.length})</span></div>
		<Button icon="plus" title={`Add ${title} task`} onclick={() => onAddTask(status)} />
	</div>

	<div class="space-y-1 overflow-y-auto pr-0.5">
		{#if tasks.length === 0}
			<div class="text-xs text-gray-500 border border-dashed rounded p-2 text-center">No tasks</div>
		{:else}
			{#each tasks as task (task.id)}
				<TaskCard task={task} onclick={onTaskClick} ondelete={onTaskDelete} ondragstart={onDragStart} ondragend={onDragEnd} />
			{/each}
		{/if}
	</div>
</div>
