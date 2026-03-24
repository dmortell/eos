<script lang="ts">
	import type { Project, Task } from "$lib/types/task";
	import { getContext } from 'svelte';
	import { Button, Checkbox, Firestore, Session } from "$lib";
	import ProjectTaskList from "./ProjectTaskList.svelte";
	import RecentActivity from "./RecentActivity.svelte";
	import TaskSummary from "./TaskSummary.svelte";
	import UserTaskList from "./UserTaskList.svelte";

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

		<div class="flex items-center justify-between gap-2 flex-wrap">
			<h1>Task Dashboard</h1>
			<div class="flex items-center gap-2">
				<Checkbox label="All Tasks" bind:value={showAllTasks}/>
				<Button variant="primary" href="/tasks">Open Task Board</Button>
			</div>
		</div>
		<div class="grid grid-cols-1 min-[900px]:grid-cols-3 gap-2 items-start">
			<div class="space-y-1">
				<h3>Overview</h3>
				<TaskSummary tasks={filteredTasks} />
				<details class="space-y-1 pt-1">
					<summary class="text-xs font-semibold text-gray-700 cursor-pointer select-none">Recent Activity</summary>
					<RecentActivity tasks={filteredTasks} />
				</details>
			</div>
				<div class="space-y-1">
					<h3>By User</h3>
					<UserTaskList tasks={filteredTasks} />
				</div>
				<div class="space-y-1">
					<h3>By Project</h3>
					<ProjectTaskList tasks={filteredTasks} {projects} />
				</div>
		</div>