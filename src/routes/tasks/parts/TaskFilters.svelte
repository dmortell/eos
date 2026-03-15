<script lang="ts">
	import { Search, Select, Button } from '$lib';
	import type { Project, TaskFiltersState, TaskUser, TaskStatus } from '$lib/types/task';

	let {
		filters = $bindable(),
		projects = [],
		users = []
	}: {
		filters: TaskFiltersState;
		projects: Project[];
		users: TaskUser[];
	} = $props();

	const allStatuses: TaskStatus[] = ['backlog', 'todo', 'in-progress', 'review', 'done'];
	const allPriorities = ['low', 'medium', 'high', 'urgent'];

	function toggleStatus(status: TaskStatus) {
		if (filters.showStatuses.includes(status)) {
			filters.showStatuses = filters.showStatuses.filter((s) => s !== status);
		} else {
			filters.showStatuses = [...filters.showStatuses, status];
		}
	}

	function clearFilters() {
		filters.projectId = 'all';
		filters.assignedTo = 'all';
		filters.search = '';
		filters.priorities = [];
		filters.showStatuses = [...allStatuses];
	}

	function togglePriority(priority: string) {
		if (filters.priorities.includes(priority)) {
			filters.priorities = filters.priorities.filter((p) => p !== priority);
		} else {
			filters.priorities = [...filters.priorities, priority];
		}
	}
</script>

<div class="flex flex-wrap items-center gap-2 border rounded-md bg-white p-1">
	<Search bind:value={filters.search} class="h-6 text-xs" />

	<Select bind:value={filters.projectId} title="Project">
		<option value="all">All Projects</option>
		{#each projects as project}
			<option value={project.id}>{project.name}</option>
		{/each}
	</Select>

	<Select bind:value={filters.assignedTo} title="Assignee">
		<option value="all">All Users</option>
		<option value="unassigned">Unassigned</option>
		{#each users as user}
			<option value={user.id}>{user.name}</option>
		{/each}
	</Select>

	<!-- {#each allStatuses as status}
		<button
			class={`text-xs border rounded px-1.5 py-0.5 ${filters.showStatuses.includes(status) ? 'bg-blue-100 border-blue-300' : 'bg-white'}`}
			onclick={() => toggleStatus(status)}
		>
			{status}
		</button>
	{/each} -->

	<div>
	{#each allStatuses as status}
		<Button variant="toggle" group active={filters.showStatuses.includes(status)} onclick={() => toggleStatus(status)} >
			{status}
		</Button>
	{/each}
	</div>

	<div>
	{#each allPriorities as priority}
		<button
			class={`text-xs border rounded px-1.5 py-0.5 ${filters.priorities.includes(priority) ? 'bg-amber-100 border-amber-300' : 'bg-white'}`}
			onclick={() => togglePriority(priority)}
			title="Priority filter"
		>
			p:{priority}
		</button>
		<!-- <Button variant="toggle2" group active={filters.priorities.includes(priority)} onclick={() => togglePriority(priority)} title="Priority filter">
			p:{priority}
		</Button> -->
	{/each}
	</div>

	<Button variant="outline" onclick={clearFilters}>Clear</Button>
</div>
