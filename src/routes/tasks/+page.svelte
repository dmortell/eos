<script lang="ts">
	import { getContext } from 'svelte';
	import { Button, Firestore, Titlebar } from '$lib';
	import TaskFilters from './parts/TaskFilters.svelte';
	import KanbanColumn from './parts/KanbanColumn.svelte';
	import TaskDialog from './parts/TaskDialog.svelte';
	import { DEFAULT_FILTERS, TASK_COLUMNS, type Project, type Task, type TaskFiltersState, type TaskStatus, type TaskUser } from '$lib/types/task';
	import type { Session } from '$lib';

	let db = getContext('db') as Firestore;
	let session = getContext('session') as Session;

	let tasks = $state<Task[]>([]);
	let projects = $state<Project[]>([]);
	let filters = $state<TaskFiltersState>(structuredClone(DEFAULT_FILTERS));
	let showAllTasks = $state(true);
	let selectedTask = $state<Task | null>(null);
	let dialogOpen = $state(false);
	let draggingTask = $state<Task | null>(null);

	const toggleKey = 'task-board-show-all';
	const filtersKey = 'task-board-filters-v1';

	$effect(() => {
		const raw = localStorage.getItem(toggleKey);
		showAllTasks = raw !== 'false';
	});

	$effect(() => {
		localStorage.setItem(toggleKey, String(showAllTasks));
	});

	$effect(() => {
		const raw = localStorage.getItem(filtersKey);
		if (!raw) return;
		try {
			const saved = JSON.parse(raw) as Partial<TaskFiltersState>;
			filters.projectId = typeof saved.projectId === 'string' ? saved.projectId : 'all';
			filters.assignedTo = typeof saved.assignedTo === 'string' ? saved.assignedTo : 'all';
			filters.search = typeof saved.search === 'string' ? saved.search : '';
			filters.priorities = Array.isArray(saved.priorities) ? saved.priorities.filter((p) => typeof p === 'string') : [];
			filters.showStatuses = Array.isArray(saved.showStatuses)
				? saved.showStatuses.filter((s): s is TaskStatus => ['backlog', 'todo', 'in-progress', 'review', 'done'].includes(String(s)))
				: [...DEFAULT_FILTERS.showStatuses];
		} catch {
			// Ignore invalid localStorage payload.
		}
	});

	$effect(() => {
		localStorage.setItem(filtersKey, JSON.stringify(filters));
	});

	$effect(() => {
		const unsubProjects = db.subscribeMany('projects', (data) => {
			projects = data as unknown as Project[];
		});
		const unsubTasks = db.subscribeMany('tasks', (data) => {
			tasks = data as unknown as Task[];
		});
		return () => {
			unsubProjects?.();
			unsubTasks?.();
		};
	});

	function toMillis(value: unknown): number {
		if (!value) return 0;
		if (typeof value === 'number') return value;
		if (value instanceof Date) return value.getTime();
		if (typeof value === 'object' && value && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
			return (value as { toDate: () => Date }).toDate().getTime();
		}
		return 0;
	}

	let users = $derived.by(() => {
		const map = new Map<string, TaskUser>();
		for (const task of tasks) {
			if (!task.assignedTo) continue;
			map.set(task.assignedTo, { id: task.assignedTo, name: task.assignedToName || task.assignedTo });
		}
		return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
	});

	let visibleTasks = $derived.by(() => {
		const me = session?.user?.uid;
		const source = showAllTasks || !me ? tasks : tasks.filter((t) => t.assignedTo === me);
		const projectMap = new Map(projects.map((p) => [p.id, p.name]));

		const filtered = source.filter((task) => {
			if (filters.projectId !== 'all' && task.projectId !== filters.projectId) return false;
			if (filters.assignedTo === 'unassigned' && task.assignedTo) return false;
			if (filters.assignedTo !== 'all' && filters.assignedTo !== 'unassigned' && task.assignedTo !== filters.assignedTo) return false;
			if (filters.priorities.length > 0 && (!task.priority || !filters.priorities.includes(task.priority))) return false;
			if (filters.showStatuses.length && !filters.showStatuses.includes(task.status)) return false;
			if (filters.search) {
				const hay = `${task.title || ''} ${task.description || ''}`.toLowerCase();
				if (!hay.includes(filters.search.toLowerCase())) return false;
			}
			return true;
		});

		return filtered
			.map((task) => ({ ...task, projectName: task.projectName || projectMap.get(task.projectId) || task.projectId }))
			.sort((a, b) => {
				const ao = a.order ?? 0;
				const bo = b.order ?? 0;
				if (ao !== bo) return ao - bo;
				return toMillis(b.updatedAt) - toMillis(a.updatedAt);
			});
	});

	let grouped = $derived.by(() => {
		const map: Record<TaskStatus, Task[]> = {
			backlog: [],
			todo: [],
			'in-progress': [],
			review: [],
			done: []
		};
		for (const task of visibleTasks) map[task.status].push(task);
		return map;
	});

	function openNewTask(status: TaskStatus = 'todo') {
		selectedTask = {
			id: '',
			title: '',
			status,
			projectId: projects[0]?.id || '',
			createdBy: session?.user?.uid,
			createdByName: session?.user?.displayName || session?.user?.email || 'unknown'
		};
		dialogOpen = true;
	}

	function openTask(task: Task) {
		selectedTask = task;
		dialogOpen = true;
	}

	async function saveTask(payload: Partial<Task>) {
		const now = new Date();
		const isNew = !payload.id;
		const resolvedId = payload.id || selectedTask?.id;
		const creatorId = payload.createdBy ?? selectedTask?.createdBy ?? session?.user?.uid ?? undefined;
		const creatorName = payload.createdByName
			?? selectedTask?.createdByName
			?? session?.user?.displayName
			?? session?.user?.email
			?? undefined;
		const taskPayload: Partial<Task> = {
			...payload,
			createdBy: creatorId,
			createdByName: creatorName,
			createdAt: isNew ? now : selectedTask?.createdAt || now,
			updatedAt: now
		};
		if (resolvedId) taskPayload.id = resolvedId;
		await db.save('tasks', {
			...taskPayload
		});
	}

	async function deleteTask(task: Task) {
		if (!task.id) return;
		await db.delete('tasks', task.id);
	}

	async function handleDrop(status: TaskStatus) {
		if (!draggingTask || draggingTask.status === status) return;
		await db.save('tasks', { ...draggingTask, status, updatedAt: new Date() });
		draggingTask = null;
	}
</script>

<Titlebar />

<div class="p-3 space-y-2">
	<div class="flex items-center justify-between">
		<h1 class="text-sm font-semibold">Task Board</h1>
		<div class="flex gap-2 items-center">
			<label class="text-xs flex items-center gap-1 border rounded px-2 py-0.5 bg-white">
				<input type="checkbox" bind:checked={showAllTasks} />
				<span>{showAllTasks ? 'All Tasks' : 'My Tasks'}</span>
			</label>
			<Button class="text-xs px-2 py-0.5" variant="primary" icon="plus" onclick={() => openNewTask('todo')}>New Task</Button>
		</div>
	</div>

	<TaskFilters bind:filters {projects} {users} />

	<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 pb-1 items-start">
		{#each TASK_COLUMNS as column}
			<KanbanColumn
				status={column.status}
				title={column.title}
				color={column.color}
				tasks={grouped[column.status]}
				onTaskClick={openTask}
				onTaskDelete={deleteTask}
				onDrop={handleDrop}
				onAddTask={openNewTask}
				onDragStart={(task) => (draggingTask = task)}
				onDragEnd={() => (draggingTask = null)}
			/>
		{/each}
	</div>
</div>

<TaskDialog bind:open={dialogOpen} task={selectedTask} {projects} {users} onSave={saveTask} onDelete={deleteTask} />
