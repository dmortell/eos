<script lang="ts">
	import { Button, Dialog, Input, Select } from '$lib';
	import type { Project, Task, TaskPriority, TaskStatus, TaskUser } from '$lib/types/task';

	let {
		open = $bindable(false),
		task = null,
		projects = [],
		users = [],
		onSave,
		onDelete
	}: {
		open?: boolean;
		task: Task | null;
		projects: Project[];
		users: TaskUser[];
		onSave: (task: Partial<Task>) => void;
		onDelete: (task: Task) => void;
	} = $props();

	let title = $state('');
	let description = $state('');
	let projectId = $state('');
	let status = $state<TaskStatus>('todo');
	let priority = $state<TaskPriority>('medium');
	let assignedTo = $state('');
	let dueDate = $state('');

	$effect(() => {
		title = task?.title ?? '';
		description = task?.description ?? '';
		projectId = task?.projectId ?? '';
		status = task?.status ?? 'todo';
		priority = task?.priority ?? 'medium';
		assignedTo = task?.assignedTo ?? '';
		dueDate = task?.dueDate ?? '';
	});

	function save() {
		if (!title.trim() || !projectId) return;
		const assigned = users.find((u) => u.id === assignedTo);
		onSave({
			id: task?.id,
			title: title.trim(),
			description: description.trim(),
			projectId,
			status,
			priority,
			assignedTo: assignedTo || undefined,
			assignedToName: assigned?.name || undefined,
			dueDate: dueDate || undefined
		});
		open = false;
	}
</script>

<Dialog bind:open title={task ? 'Edit Task' : 'New Task'}>
	<div class="space-y-3 mt-2">
		<Input label="Title" bind:value={title} placeholder="Task title" />
		<Input label="Description" type="textarea" bind:value={description} rows="3" />

		<div class="grid grid-cols-2 gap-2">
			<Select bind:value={projectId}>
				<option value="">Select Project</option>
				{#each projects as project}
					<option value={project.id}>{project.name}</option>
				{/each}
			</Select>

			<Select bind:value={status}>
				<option value="backlog">backlog</option>
				<option value="todo">todo</option>
				<option value="in-progress">in-progress</option>
				<option value="review">review</option>
				<option value="done">done</option>
			</Select>
		</div>

		<div class="grid grid-cols-2 gap-2">
			<Select bind:value={priority}>
				<option value="low">low</option>
				<option value="medium">medium</option>
				<option value="high">high</option>
				<option value="urgent">urgent</option>
			</Select>

			<Select bind:value={assignedTo}>
				<option value="">Unassigned</option>
				{#each users as user}
					<option value={user.id}>{user.name}</option>
				{/each}
			</Select>
		</div>

		<Input label="Due Date" type="date" bind:value={dueDate} />

		<div class="flex justify-between pt-1">
			<div>
				{#if task?.id}
					<Button variant="danger" onclick={() => { onDelete(task); open = false; }}>Delete</Button>
				{/if}
			</div>
			<div class="flex gap-2">
				<Button variant="outline" onclick={() => open = false}>Cancel</Button>
				<Button variant="primary" onclick={save} disabled={!title.trim() || !projectId}>Save</Button>
			</div>
		</div>
	</div>
</Dialog>
