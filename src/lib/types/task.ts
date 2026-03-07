export type TaskStatus = 'backlog' | 'todo' | 'in-progress' | 'review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Task {
	id: string;
	title: string;
	description?: string;
	status: TaskStatus;
	priority?: TaskPriority;
	projectId: string;
	projectName?: string;
	assignedTo?: string;
	assignedToName?: string;
	createdBy?: string;
	createdByName?: string;
	createdAt?: unknown;
	updatedAt?: unknown;
	dueDate?: string;
	tags?: string[];
	order?: number;
}

export interface Project {
	id: string;
	name: string;
	description?: string;
}

export interface TaskUser {
	id: string;
	name: string;
}

export interface TaskFiltersState {
	projectId: string;
	assignedTo: string;
	search: string;
	priorities: string[];
	showStatuses: TaskStatus[];
}

export const TASK_COLUMNS: Array<{ status: TaskStatus; title: string; color: string }> = [
	{ status: 'backlog', title: 'Backlog', color: 'bg-gray-100 border-gray-300' },
	{ status: 'todo', title: 'To Do', color: 'bg-blue-50 border-blue-200' },
	{ status: 'in-progress', title: 'In Progress', color: 'bg-amber-50 border-amber-200' },
	{ status: 'review', title: 'Review', color: 'bg-violet-50 border-violet-200' },
	{ status: 'done', title: 'Done', color: 'bg-emerald-50 border-emerald-200' }
];

export const DEFAULT_FILTERS: TaskFiltersState = {
	projectId: 'all',
	assignedTo: 'all',
	search: '',
	priorities: [],
	showStatuses: ['backlog', 'todo', 'in-progress', 'review', 'done']
};
