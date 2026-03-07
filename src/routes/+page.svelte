<script lang="ts">
	import { getContext } from 'svelte';
	import { Button, Firestore, Titlebar, type Session } from '$lib';
	import type { Project, Task } from '$lib/types/task';
	import Projects from './projects/Projects.svelte';
	import TaskSummary from './dashboard/parts/TaskSummary.svelte';
	import ProjectTaskList from './dashboard/parts/ProjectTaskList.svelte';
	import UserTaskList from './dashboard/parts/UserTaskList.svelte';
	import RecentActivity from './dashboard/parts/RecentActivity.svelte';

	let db = getContext('db') as Firestore;
	let session = getContext('session') as Session;

	let projects = $state<Project[]>([]);
	let tasks = $state<Task[]>([]);
	let showAllTasks = $state(true);
	const toggleKey = 'task-board-show-all';

	$effect(() => {
		const raw = localStorage.getItem(toggleKey);
		showAllTasks = raw !== 'false';
	});

	$effect(() => {
		localStorage.setItem(toggleKey, String(showAllTasks));
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

	let filteredTasks = $derived.by(() => {
		const me = session?.user?.uid;
		if (showAllTasks || !me) return tasks;
		return tasks.filter((task) => task.assignedTo === me);
	});
</script>

<Titlebar />

<div class="p-3 space-y-3">
	<section class="space-y-1">
		<div class="border rounded-md bg-white p-1">
			<Projects />
		</div>
	</section>

	<section class="space-y-1 border rounded-md bg-white p-3">
		<div class="flex items-center justify-between gap-2 flex-wrap">
			<h2 class="text-sm font-semibold">Task Dashboard</h2>
			<div class="flex items-center gap-2">
				<label class="text-xs flex items-center gap-1 border rounded px-2 py-0.5 bg-white">
					<input type="checkbox" bind:checked={showAllTasks} />
					<span>{showAllTasks ? 'All Tasks' : 'My Tasks'}</span>
				</label>
				<Button class="text-xs px-2 py-0.5" variant="primary" href="/tasks">Open Task Board</Button>
			</div>
		</div>
		<div class="grid grid-cols-1 min-[800px]:grid-cols-3 gap-2 items-start">
			<div class="space-y-1">
				<h3 class="text-xs font-semibold text-gray-700">Overview</h3>
				<TaskSummary tasks={filteredTasks} />
				<details class="space-y-1 pt-1">
					<summary class="text-xs font-semibold text-gray-700 cursor-pointer select-none">Recent Activity</summary>
					<div class="pt-1">
						<RecentActivity tasks={filteredTasks} />
					</div>
				</details>
			</div>
			<!-- <div class="grid grid-cols-1 min-[800px]:grid-cols-2 gap-2 items-start"> -->
				<div class="space-y-1">
					<h3 class="text-xs font-semibold text-gray-700">By User</h3>
					<UserTaskList tasks={filteredTasks} />
				</div>
				<div class="space-y-1">
					<h3 class="text-xs font-semibold text-gray-700">By Project</h3>
					<ProjectTaskList tasks={filteredTasks} {projects} />
				</div>
			<!-- </div> -->
		</div>
	</section>
</div>