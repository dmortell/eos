<script lang="ts">
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
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
	let userDocs = $state<Array<{ id: string; uid?: string; displayName?: string; email?: string; providerIds?: string[] }>>([]);
	let filters = $state<TaskFiltersState>(structuredClone(DEFAULT_FILTERS));
	// let showAllTasks = $state(true);
	let selectedTask = $state<Task | null>(null);
	let dialogOpen = $state(false);
	let draggingTask = $state<Task | null>(null);
	let queryOpenedTaskId = $state('');
	let queryAppliedFilterKey = $state('');

	const toggleKey = 'task-board-show-all';
	const filtersKey = 'task-board-filters-v1';

	// $effect(() => {
	// 	const raw = localStorage.getItem(toggleKey);
	// 	showAllTasks = raw !== 'false';
	// });

	// $effect(() => {
	// 	localStorage.setItem(toggleKey, String(showAllTasks));
	// });

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
		const unsubUsers = db.subscribeMany('users', (data) => {
			userDocs = data as unknown as Array<{ id: string; uid?: string; displayName?: string; email?: string; providerIds?: string[] }>;
		});
		const unsubTasks = db.subscribeMany('tasks', (data) => {
			tasks = data as unknown as Task[];
		});
		return () => {
			unsubProjects?.();
			unsubUsers?.();
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
		for (const user of userDocs) {
			if (!('providerIds' in user)) continue;
			const id = user.uid || user.id;
			if (!id) continue;
			map.set(id, {
				id,
				name: user.displayName || user.email || id
			});
		}
		return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
	});

	let visibleTasks = $derived.by(() => {
		const me = session?.user?.uid;
		// const source = showAllTasks || !me ? tasks : tasks.filter((t) => t.assignedTo === me);
		const projectMap = new Map(projects.map((p) => [p.id, p.name]));

		const filtered = tasks.filter((task) => {
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

	$effect(() => {
		const taskId = page.url.searchParams.get('taskId') || '';
		if (!taskId || taskId === queryOpenedTaskId || tasks.length === 0) return;
		const found = tasks.find((task) => task.id === taskId);
		if (!found) return;
		queryOpenedTaskId = taskId;
		openTask(found);
		try {
			const url = new URL(window.location.href);
			url.searchParams.delete('taskId');
			replaceState(url.toString(), page.state);
		} catch {
			// Ignore history update issues in non-browser contexts.
		}
	});

	$effect(() => {
		const projectId = page.url.searchParams.get('projectId') || '';
		const assignedTo = page.url.searchParams.get('assignedTo') || '';
		if (!projectId && !assignedTo) return;
		const key = `${projectId}|${assignedTo}`;
		if (key === queryAppliedFilterKey) return;

		if (projectId) filters.projectId = projectId;
		if (assignedTo) filters.assignedTo = assignedTo;
		queryAppliedFilterKey = key;

		try {
			const url = new URL(window.location.href);
			url.searchParams.delete('projectId');
			url.searchParams.delete('assignedTo');
			replaceState(url.toString(), page.state);
		} catch {
			// Ignore history update issues in non-browser contexts.
		}
	});

	function openNewTask(status: TaskStatus = 'todo') {
		const today = new Date();
		const todayDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
		const defaultProjectId = filters.projectId !== 'all'
			? filters.projectId
			: (projects[0]?.id || '');
		selectedTask = {
			id: '',
			title: '',
			status,
			projectId: defaultProjectId,
			assignedTo: session?.user?.uid || undefined,
			assignedToName: session?.user?.displayName || session?.user?.email || undefined,
			dueDate: todayDate,
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
			<!-- <label class="text-xs flex items-center gap-1 border rounded px-2 py-0.5 bg-white">
				<input type="checkbox" bind:checked={showAllTasks} />
				<span>{showAllTasks ? 'All Tasks' : 'My Tasks'}</span>
			</label> -->
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
