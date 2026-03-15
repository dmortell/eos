<script lang="ts">
	import { getContext } from 'svelte';
	import { Button, Firestore, Titlebar, type Session } from '$lib';
	import type { Project, Task } from '$lib/types/task';
	import Projects from './projects/Projects.svelte';
	import TaskSummary from './dashboard/parts/TaskSummary.svelte';
	import ProjectTaskList from './dashboard/parts/ProjectTaskList.svelte';
	import UserTaskList from './dashboard/parts/UserTaskList.svelte';
	import RecentActivity from './dashboard/parts/RecentActivity.svelte';
    import ButtonNew from '$lib/ui/ButtonNew.svelte';
    import Dashboard from './dashboard/parts/Dashboard.svelte';

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
	<section class=""><Projects /></section>
	<section class="space-y-1 border rounded-md bg-white p-3"><Dashboard /></section>
</div>