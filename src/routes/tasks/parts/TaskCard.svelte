<script lang="ts">
	import type { Task } from '$lib/types/task';
	import { Icon } from '$lib';

	let {
		task,
		onclick,
		ondelete,
		ondragstart,
		ondragend,
		compact = false
	}: {
		task: Task;
		onclick?: (task: Task) => void;
		ondelete?: (task: Task) => void;
		ondragstart?: (task: Task) => void;
		ondragend?: () => void;
		compact?: boolean;
	} = $props();

	const priorityClass: Record<string, string> = {
		low: 'bg-gray-400',
		medium: 'bg-blue-500',
		high: 'bg-orange-500',
		urgent: 'bg-red-600'
	};

	function isOverdue(dueDate?: string): boolean {
		if (!dueDate) return false;
		const endOfDay = new Date(`${dueDate}T23:59:59`).getTime();
		return Date.now() > endOfDay;
	}

	function cardDragStart() {
		ondragstart?.(task);
	}

	const assigneeLabel = $derived(task.assignedToName?.trim() || 'Unassigned');
	const isUnassigned = $derived(!task.assignedToName?.trim());
</script>

<div
	class="group border rounded-md bg-white p-1.5 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
	role="button"
	tabindex="0"
	draggable="true"
	onclick={() => onclick?.(task)}
	onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') onclick?.(task); }}
	ondragstart={cardDragStart}
	ondragend={() => ondragend?.()}
>
	<div class="flex items-start justify-between gap-1.5">
		<div class="font-medium text-xs leading-tight line-clamp-2">{task.title || '(untitled task)'}</div>
		<div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
			<button class="text-gray-500 hover:text-gray-800" title="Edit" onclick={(e) => { e.stopPropagation(); onclick?.(task); }}>
				<Icon name="edit" size={14} />
			</button>
			<button class="text-red-500 hover:text-red-700" title="Delete" onclick={(e) => { e.stopPropagation(); ondelete?.(task); }}>
				<Icon name="trash" size={14} />
			</button>
		</div>
	</div>

	{#if !compact && task.description}
		<div class="text-xs text-gray-600 mt-0.5 line-clamp-2">{task.description}</div>
	{/if}

	<div class="flex items-center justify-between mt-1 text-xs text-gray-600 gap-1.5">
		<div class="flex items-center gap-1 min-w-0">
			{#if task.priority}
				<span class={`inline-block h-2 w-2 rounded-full ${priorityClass[task.priority] || 'bg-gray-400'}`}></span>
			{/if}
			{#if task.projectName}
				<span class="truncate">{task.projectName}</span>
			{/if}
		</div>
		{#if task.dueDate}
			<span class={isOverdue(task.dueDate) ? 'text-red-600 font-medium' : ''}>{task.dueDate}</span>
		{/if}
	</div>

	<div class={`mt-0.5 inline-flex items-center rounded px-1.5 py-0.5 text-xs truncate ${isUnassigned ? 'bg-amber-100 text-amber-800 font-medium border border-amber-200' : 'text-gray-500'}`}>
		{assigneeLabel}
	</div>
</div>
