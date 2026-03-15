# Kanban Board Implementation Plan

## Overview

### Two-Part Implementation:

1. **Dashboard Summary** (`src/routes/+page.svelte`) — Management overview showing:
   - Task counts by status (pending, in-progress, review)
   - Tasks by project with visual indicators
   - Tasks by user/assignee
   - Recent activity feed
   - Quick access to kanban board

2. **Kanban Board Page** (`src/routes/tasks/+page.svelte`) — Full task management:
   - Complete kanban board with all status columns
   - Drag & drop task management
   - Filter by projects (user sees all their assigned projects)
   - Create, edit, delete tasks
   - Advanced filtering and search

### User Flow

```
┌─────────────────────────────────────────────────────────┐
│  Dashboard (/+page.svelte)                              │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Projects List (existing)                        │   │
│  └─────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Task Summary Cards                              │   │
│  │  [12 Pending] [5 In Progress] [3 Review] ...   │   │
│  └─────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Tasks by Project                                │   │
│  │  Project Alpha: 5 pending, 2 in progress       │   │
│  │  Project Beta:  3 pending, 1 in progress       │   │
│  └─────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Tasks by User                                   │   │
│  │  John: 5 pending, 2 in progress                │   │
│  │  Jane: 3 pending, 1 in progress                │   │
│  └─────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Recent Activity                                 │   │
│  │  Jane moved "Setup auth" to Done - 2 min ago   │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│        [Open Task Board] ──────────────────────┐        │
└─────────────────────────────────────────────────┼───────┘
                                                  │
                                                  ▼
┌─────────────────────────────────────────────────────────┐
│  Kanban Board (/tasks/+page.svelte)                    │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Filters: [Projects ▼] [Users ▼] [Search...]    │   │
│  └─────────────────────────────────────────────────┘   │
│  ┌────────┬────────┬────────┬────────┬────────────┐   │
│  │Backlog │ To Do  │Progress│ Review │    Done    │   │
│  ├────────┼────────┼────────┼────────┼────────────┤   │
│  │[Task 1]│[Task 4]│[Task 7]│[Task 9]│ [Task 11]  │   │
│  │[Task 2]│[Task 5]│[Task 8]│        │ [Task 12]  │   │
│  │[Task 3]│[Task 6]│        │        │            │   │
│  │   +    │   +    │   +    │   +    │     +      │   │
│  └────────┴────────┴────────┴────────┴────────────┘   │
│         ▲ Drag & Drop between columns ▲                │
└─────────────────────────────────────────────────────────┘
```

## Architecture

### 1. Data Model (Firestore)

#### New Collection: `tasks`
```typescript
interface Task {
  id: string;                    // Auto-generated
  title: string;                 // Task title
  description?: string;          // Task description
  status: 'backlog' | 'todo' | 'in-progress' | 'review' | 'done'; // Current status
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  projectId: string;             // Reference to projects collection
  assignedTo?: string;           // User ID (from auth.user.uid)
  assignedToName?: string;       // User display name (denormalized for quick display)
  createdBy: string;             // Creator user ID
  createdByName: string;         // Creator display name
  createdAt: Timestamp;          // Server timestamp
  updatedAt: Timestamp;          // Server timestamp
  dueDate?: string;              // ISO date string (YYYY-MM-DD)
  tags?: string[];               // Optional tags for filtering
  order?: number;                // Sort order within column (for manual reordering)
}
```

#### Firestore Security Rules Update
Add rules for the new `tasks` collection (location: Firebase Console):
```javascript
match /tasks/{taskId} {
  allow read: if request.auth != null;
  allow create: if request.auth != null &&
                   request.resource.data.createdBy == request.auth.uid &&
                   request.resource.data.createdAt == request.time;
  allow update: if request.auth != null;
  allow delete: if request.auth != null &&
                  (resource.data.createdBy == request.auth.uid ||
                   get(/databases/$(database)/documents/projects/$(resource.data.projectId)).data.ownerId == request.auth.uid);
}
```

### 2. Component Structure

```
src/
├── routes/
│   ├── +page.svelte                         [MODIFY] Dashboard with task summary
│   ├── dashboard/
│   │   └── parts/
│   │       ├── TaskSummary.svelte           [CREATE] Task count cards by status
│   │       ├── ProjectTaskList.svelte       [CREATE] Tasks grouped by project
│   │       ├── UserTaskList.svelte          [CREATE] Tasks grouped by user
│   │       └── RecentActivity.svelte        [CREATE] Recent task updates feed
│   └── tasks/
│       ├── +page.svelte                     [CREATE] Full kanban board page
│       └── parts/
│           ├── KanbanColumn.svelte          [CREATE] Individual column (status)
│           ├── TaskCard.svelte              [CREATE] Individual task card
│           ├── TaskDialog.svelte            [CREATE] Create/edit task dialog
│           └── TaskFilters.svelte           [CREATE] Filter controls (project, user, search)
└── lib/
    └── types/
        └── task.ts                          [CREATE] TypeScript types for tasks
```

### 3. Implementation Steps

#### Phase 1: Data Layer & Types (Est. 30 min)

**Step 1.1:** Create TypeScript types
- File: `src/lib/types/task.ts`
- Define Task interface matching Firestore schema
- Export type definitions and status/priority enums

**Step 1.2:** Update Firestore wrapper (if needed)
- File: `src/lib/db.svelte.ts`
- Verify existing methods support task operations
- Methods needed:
  - ✅ `subscribeMany()` — subscribe to all tasks
  - ✅ `subscribeWhere()` — filter by project or user
  - ✅ `save()` — create/update tasks
  - ✅ `delete()` — delete tasks
  - ✅ `saveBatch()` — reorder tasks in bulk

#### Phase 2: Dashboard Summary Components (Est. 60 min)

**Step 2.1:** Create TaskSummary.svelte
- Location: `src/routes/dashboard/parts/TaskSummary.svelte`
- Props: `tasks: Task[]`
- Display: Cards showing counts for each status:
  ```
  [Pending: 12] [In Progress: 5] [Review: 3] [Done: 24]
  ```
- Styling:
  - Grid layout (4 columns on desktop, 2 on mobile)
  - Color-coded borders matching status colors
  - Click to navigate to kanban page with filter
  - Large count numbers, small labels
  - Icon for each status

**Step 2.2:** Create ProjectTaskList.svelte
- Location: `src/routes/dashboard/parts/ProjectTaskList.svelte`
- Props: `tasks: Task[]`, `projects: Project[]`
- Display: Table/list view grouped by project:
  ```
  Project Alpha
    ├─ Pending: 5 | In Progress: 2 | Review: 1
  Project Beta
    ├─ Pending: 3 | In Progress: 1 | Review: 0
  ```
- Features:
  - Expandable/collapsible project rows
  - Progress bar showing completion %
  - Click project row to filter kanban by project
  - Show overdue tasks count with warning icon

**Step 2.3:** Create UserTaskList.svelte
- Location: `src/routes/dashboard/parts/UserTaskList.svelte`
- Props: `tasks: Task[]`
- Display: Table showing tasks by assignee:
  ```
  User              | Pending | In Progress | Review
  John Doe          |    5    |      2      |   1
  Jane Smith        |    3    |      1      |   0
  (Unassigned)      |    4    |      0      |   0
  ```
- Features:
  - Sortable columns
  - Click row to filter kanban by user
  - Show overdue count per user
  - Avatar/initials for each user

**Step 2.4:** Create RecentActivity.svelte
- Location: `src/routes/dashboard/parts/RecentActivity.svelte`
- Props: `tasks: Task[]` (pass sorted by updatedAt)
- Display: Feed of recent task changes (last 10-20):
  ```
  [Icon] Jane moved "Setup auth" to Done - 2 min ago
  [Icon] John created "Design kanban" - 15 min ago
  [Icon] Jane assigned "API testing" to John - 1 hour ago
  ```
- Features:
  - Relative timestamps (moment.js style)
  - Activity type icons (created, moved, assigned, etc.)
  - Click to view task in kanban
  - Auto-refresh or real-time updates

#### Phase 3: Kanban Page - Task Card & Dialog (Est. 60 min)

**Step 3.1:** Create TaskCard.svelte
- Location: `src/routes/tasks/parts/TaskCard.svelte`
- Props: `task`, `onclick`, `ondragstart`, `ondragend`, `compact` (boolean)
- Display:
  - Task title (truncated if long)
  - Priority badge (colored dot/icon)
  - Assignee avatar/initials (if assigned)
  - Due date (with color coding: red if overdue, yellow if due soon)
  - Project name/badge
  - Quick actions: edit, delete icons on hover
- Styling:
  - Match existing UI patterns (rounded border, shadow on hover)
  - Compact mode for dashboard (smaller text, no description)
  - Full mode for kanban (show more details)
- Draggable: Add `draggable="true"` attribute for kanban view

**Step 3.2:** Create TaskDialog.svelte
- Location: `src/routes/tasks/parts/TaskDialog.svelte`
- Props: `task` (null for new), `projects`, `users`, `onSave`, `onClose`
- Form fields:
  - Title (required, Input component)
  - Description (textarea)
  - Project (Select dropdown)
  - Status (Select dropdown)
  - Priority (Select dropdown)
  - Assigned To (Select dropdown with user names)
  - Due Date (date input)
  - Tags (comma-separated input or tag chips)
- Actions:
  - Save button (primary variant)
  - Cancel button (outline variant)
  - Delete button (danger variant, only for existing tasks)
- Use Dialog component from `$lib`
- Validation: Title required, project required

#### Phase 4: Kanban Page - Columns & Filters (Est. 45 min)

**Step 4.1:** Create KanbanColumn.svelte
- Location: `src/routes/tasks/parts/KanbanColumn.svelte`
- Props:
  - `status: TaskStatus`
  - `title: string`
  - `color: string`
  - `tasks: Task[]`
  - `onTaskClick: (task) => void`
  - `onDrop: (task, newStatus) => void`
  - `onAddTask: () => void`
- Display:
  - Column header with title and count badge
  - Scrollable task list using TaskCard component
  - Empty state message ("No tasks")
  - Add task button (+ icon) in header
- Drag & Drop:
  - Accept dragged tasks with `ondrop`, `ondragover`, `ondragenter`, `ondragleave`
  - Highlight column when dragging task over it (border color change)
  - Call `onDrop()` when task dropped
- Styling:
  - Min width: 280px
  - Max height: calc(100vh - 200px) with overflow-y-auto
  - Background: light gray (matching color scheme)
  - Border radius, padding
  - Header with status color accent

**Step 4.2:** Create TaskFilters.svelte
- Location: `src/routes/tasks/parts/TaskFilters.svelte`
- Props: `projects`, `users`, bindable `filters` object
- Filters:
  - Project multi-select (with "All Projects" option)
  - Assigned To dropdown (with "All Users", "Unassigned", "Assigned to me")
    - NOTE: The main "All Tasks / My Tasks" toggle is in the page header, not here
  - Search input (searches title and description)
  - Status toggles (show/hide columns)
  - Priority filter (multi-select)
  - Date range picker (optional)
  - Clear all filters button
- Layout: Horizontal row with flex gap, wraps on mobile
- Use Search, Select, Button components from `$lib`
- Persist filters in localStorage

#### Phase 5: Kanban Page - Main Component (Est. 75 min)

**Step 5.1:** Create +page.svelte (Kanban)
- Location: `src/routes/tasks/+page.svelte`
- Import: Firestore, Session from context
- Subscribe to data:
  - `projects` collection
  - `tasks` collection (all tasks)
  - Derive unique users from tasks
- State:
  - `tasks` — all tasks ($state)
    - `showAllTasks` — toggle for all vs my tasks ($state, synced with localStorage)
  - `filteredTasks` — derived from tasks and filters ($derived)
  - `filters` — filter state object ($state)
  - `selectedTask` — for edit dialog ($state)
  - `showDialog` — boolean for dialog visibility ($state)
  - `draggingTask` — currently dragging task ($state)
- Columns definition:
  ```typescript
  const columns = [
    { status: 'backlog', title: 'Backlog', color: 'gray' },
    { status: 'todo', title: 'To Do', color: 'blue' },
    { status: 'in-progress', title: 'In Progress', color: 'yellow' },
    { status: 'review', title: 'Review', color: 'purple' },
    { status: 'done', title: 'Done', color: 'green' },
  ];
  ```
- Computed:
  - Group filtered tasks by status using $derived
  - Filter by project, user, search term
  - Sort by order field within each column
- Functions:
  - `handleTaskClick(task)` — open edit dialog
  - `handleTaskDrop(task, newStatus)` — update task status in Firestore
  - `handleTaskSave(task)` — save to Firestore (create or update)
  - `handleTaskDelete(taskId)` — delete from Firestore
  - `handleNewTask(status?)` — open dialog for new task with optional preset status
  - `handleDragStart(task)` — set draggingTask state
  - `handleDragEnd()` — clear draggingTask state
- Layout:
  ```svelte
  <Titlebar>
    <span>Task Board</span>
    <Button onclick={() => handleNewTask()}>New Task</Button>
  </Titlebar>
  <div class="p-4">
        <div class="flex justify-between items-center mb-4">
          <h1 class="text-xl font-bold">Task Board</h1>
          <div class="flex gap-2">
            <label class="flex items-center gap-2">
              <input type="checkbox" bind:checked={showAllTasks} />
              {showAllTasks ? 'All Tasks' : 'My Tasks'}
            </label>
            <Button onclick={() => handleNewTask()} variant="primary">New Task</Button>
          </div>
        </div>
    <TaskFilters bind:filters {projects} {users} />
    <div class="flex gap-4 overflow-x-auto mt-4">
      {#each columns as col}
        <KanbanColumn
          status={col.status}
          title={col.title}
          color={col.color}
          tasks={filteredTasksByStatus[col.status]}
          onTaskClick={handleTaskClick}
          onDrop={handleTaskDrop}
          onAddTask={() => handleNewTask(col.status)}
        />
      {/each}
    </div>
  </div>
  {#if showDialog}
    <TaskDialog
      task={selectedTask}
      {projects}
      {users}
      onSave={handleTaskSave}
      onClose={() => showDialog = false}
    />
  {/if}
  ```

**Step 5.2:** Drag & Drop Logic
- Use native HTML5 drag and drop API (no library needed)
- On drag start: Store task data in event.dataTransfer
- On drop: Update task status in Firestore
- Visual feedback: Add dragging class to card, highlight drop zone
- Ensure drag works across columns

#### Phase 6: Dashboard Integration (Est. 45 min)

**Step 6.1:** Update +page.svelte (Dashboard)
- Location: `src/routes/+page.svelte`
- Import dashboard summary components
- Subscribe to:
  - `projects` collection
  - `tasks` collection
- State:
  - `showAllTasks` — toggle state ($state, default: true)
  - `filteredTasks` — derived based on toggle ($derived)
- Toggle logic:
  - Filter: `showAllTasks ? allTasks : allTasks.filter(t => t.assignedTo === session.user.uid)`
  - Save preference to localStorage: `localStorage.setItem('showAllTasks', showAllTasks)`
  - Load on mount from localStorage
- Layout:
  ```svelte
  <Titlebar />
  <div class="p-8">
    <!-- Projects Section -->
    <div class="mb-8">
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-xl font-bold">Projects</h1>
      </div>
      <Projects /> <!-- Existing component, make more compact -->
    </div>

    <!-- Task Summary Section -->
    <div class="mb-8">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-bold">Tasks Overview</h2>
        <div class="flex gap-2 items-center">
          <!-- Toggle Switch -->
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" bind:checked={showAllTasks} class="..." />
            <span>{showAllTasks ? 'All Tasks' : 'My Tasks'}</span>
          </label>
          <Button href="/tasks" variant="primary">
            Open Task Board
          </Button>
        </div>
      </div>
      <TaskSummary tasks={filteredTasks} />
    </div>

    <!-- Tasks by Project -->
    <div class="mb-8">
      <h2 class="text-lg font-bold mb-4">Tasks by Project</h2>
      <ProjectTaskList tasks={filteredTasks} {projects} />
    </div>

    <!-- Tasks by User -->
    <div class="mb-8">
      <h2 class="text-lg font-bold mb-4">Tasks by User</h2>
      <UserTaskList tasks={filteredTasks} />
    </div>

    <!-- Recent Activity -->
    <div>
      <h2 class="text-lg font-bold mb-4">Recent Activity</h2>
      <RecentActivity tasks={filteredTasks.slice(0, 20).sort(...)} />
    </div>
  </div>
  ```

**Step 6.2:** Add same toggle to Kanban page
- Location: `src/routes/tasks/+page.svelte`
- Add toggle in the filters bar (TaskFilters component or main page header)
- Same logic: filter tasks by `assignedTo === session.user.uid` when "My Tasks" selected
- Sync with localStorage so preference persists across dashboard/kanban

### 4. Styling & UX Details

#### Color Scheme (Tailwind classes)
- **Backlog**: gray-200 bg, gray-700 text
- **To Do**: blue-100 bg, blue-700 text
- **In Progress**: yellow-100 bg, yellow-700 text
- **Review**: purple-100 bg, purple-700 text
- **Done**: green-100 bg, green-700 text

#### Priority Indicators
- Low: gray dot
- Medium: blue dot
- High: orange dot
- Urgent: red dot with pulse animation

#### Task Card Hover State
- Increase shadow: `hover:shadow-lg`
- Show action buttons (edit, delete)
- Subtle scale: `hover:scale-[1.02]`
- Transition: `transition-all duration-200`

#### Responsive Design
- Desktop: Show all columns horizontally
- Tablet: Horizontal scroll for columns
- Mobile: Stack columns vertically OR single column view with status filter dropdown

### 5. Advanced Features (Optional - Phase 7+)

**5.1 Keyboard Shortcuts**
- `N` — New task
- `F` — Focus search
- `ESC` — Close dialog

**5.2 Task Reordering**
- Drag tasks up/down within same column
- Update `order` field on drop
- Re-sort after changes

**5.3 Subtasks**
- Add `parentId` field to Task
- Show subtasks nested under parent
- Completion percentage for parent

**5.4 Activity Log**
- New collection: `task_activity`
- Log status changes, assignments, comments
- Display timeline in task detail view

**5.5 Real-time Presence**
- Show who's viewing/editing each task
- Use existing `presence` collection pattern

**5.6 Bulk Operations**
- Select multiple tasks (checkboxes)
- Bulk status change, assignment, deletion
- Action bar when tasks selected

**5.7 Analytics Dashboard**
- Tasks by status (chart)
- Tasks by project (chart)
- Tasks by user (chart)
- Overdue tasks count
- Completion rate

### 6. Testing Checklist

#### Functionality
- [ ] Create new task with all fields
- [ ] Edit existing task
- [ ] Delete task
- [ ] Drag task between columns (status change)
- [ ] Filter by project
- [ ] Filter by assigned user
- [ ] Search tasks by title/description
- [ ] View task details
- [ ] Assign task to user
- [ ] Set due date and priority
- [ ] Task updates in real-time (multiple users)

#### UI/UX
- [ ] Responsive on mobile, tablet, desktop
- [ ] Drag and drop visual feedback
- [ ] Loading states
- [ ] Empty states
- [ ] Error handling
- [ ] Smooth animations

#### Data
- [ ] Firestore security rules work
- [ ] Tasks tied to correct project
- [ ] User permissions respected
- [ ] Timestamps auto-populate
- [ ] Real-time updates work

### 7. Deployment Notes

**Before deploying:**
1. Add Firestore indexes if queries are complex:
   ```
   tasks: [projectId, status], [assignedTo, status], [createdAt]
   ```

2. Update Firestore security rules in Firebase Console

3. Test with production data (or seed test data)

4. Set up cloud functions (optional) for:
   - Task notifications
   - Auto-archive completed tasks
   - Task deadline reminders

### 8. File Creation Order

**Recommended implementation order:**

**Round 1: Foundation**
1. `src/lib/types/task.ts` — TypeScript types and enums

**Round 2: Shared Components (used by both dashboard and kanban)**
2. `src/routes/tasks/parts/TaskCard.svelte` — Reusable task card (compact mode for dashboard)
3. `src/routes/tasks/parts/TaskDialog.svelte` — Task create/edit dialog

**Round 3: Dashboard Summary**
4. `src/routes/dashboard/parts/TaskSummary.svelte` — Status count cards
5. `src/routes/dashboard/parts/ProjectTaskList.svelte` — Tasks grouped by project
6. `src/routes/dashboard/parts/UserTaskList.svelte` — Tasks by user table
7. `src/routes/dashboard/parts/RecentActivity.svelte` — Activity feed
8. Update `src/routes/+page.svelte` — Dashboard with summary components

**Round 4: Kanban Page**
9. `src/routes/tasks/parts/KanbanColumn.svelte` — Status column component
10. `src/routes/tasks/parts/TaskFilters.svelte` — Filter controls
11. `src/routes/tasks/+page.svelte` — Full kanban board page

**Round 5: Polish & Testing**
12. Test all functionality
13. Add keyboard shortcuts
14. Responsive testing
15. Performance optimization

### 9. Estimated Timeline

| Phase | Task | Time |
|-------|------|------|
| 1 | Data layer & types | 30 min |
| 2 | Dashboard summary components | 60 min |
| 3 | TaskCard + Dialog (shared) | 60 min |
| 4 | KanbanColumn + Filters | 45 min |
| 5 | Kanban page (+page.svelte) | 75 min |
| 6 | Dashboard integration | 45 min |
| 6 | Dashboard integration | 45 min |
| 7 | Testing & polish | 60 min |
| **Total** | | **~5.5 hours** |

Advanced features (Phase 7+): 2-4 hours per feature

### 10. Sample Data for Testing

```javascript
// Run in Firebase Console to seed test data
const tasks = [
  {
    title: "Setup authentication",
    description: "Implement Google OAuth",
    status: "done",
    priority: "high",
    projectId: "proj123",
    assignedTo: "user456",
    assignedToName: "John Doe",
    createdBy: "user456",
    createdByName: "John Doe",
    createdAt: new Date(),
    updatedAt: new Date(),
    dueDate: "2026-03-10"
  },
  {
    title: "Design kanban board",
    status: "in-progress",
    priority: "medium",
    projectId: "proj123",
    assignedTo: "user789",
    assignedToName: "Jane Smith",
    createdBy: "user456",
    createdByName: "John Doe",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  // Add more...
];
```

### 11. Next Steps

1. **Review this plan** — Confirm approach and priorities
2. **Create Firestore collection** — Set up `tasks` in Firebase Console
3. **Update security rules** — Add rules for tasks collection
4. **Start with Phase 1** — Types and data layer
5. **Build incrementally** — Test each component before moving on
6. **Iterate on feedback** — Adjust as needed

---

## Architecture Summary

### Dashboard View (Management)
**Purpose:** High-level overview of all tasks across all users and projects

**Location:** `src/routes/+page.svelte`

**Features:**
- Task count cards (pending, in-progress, review, done)
- **Toggle to view "All Tasks" vs. "My Tasks Only"** (affects all dashboard views)
- Tasks grouped by project with progress indicators
- Tasks grouped by user/assignee with workload view
- Recent activity feed
- "Open Task Board" button to navigate to full kanban

**Target Users:** Project managers, team leads, anyone wanting overview

### Kanban Page (Task Management)
**Purpose:** Detailed task management with drag & drop

**Location:** `src/routes/tasks/+page.svelte`

**Features:**
- Full 5-column kanban board
- **Toggle to view "All Tasks" vs. "My Tasks Only"**
- Drag & drop between status columns
- Advanced filtering (project, user, search, priority, date)
- Create, edit, delete tasks
- Persistent filter preferences in localStorage

**Target Users:** Individual contributors, anyone assigned to projects

---

## Remaining Questions

1. **User project access** — How do we determine which projects a user is "assigned to"?
   - Option A: Any user can see all projects (current behavior)
   - Option B: Add `members` array field to projects collection
   - Option C: Derive from tasks (if user has tasks in project, they can see it)

2. **Default dashboard filter** — What should dashboard show by default?
  - **CONFIRMED:** Toggle between all tasks and user's own tasks
  - Default view: All tasks (for management overview)
  - Toggle persisted in localStorage per user

3. **Task permissions** — Who can perform actions?
   - Create task: Any authenticated user? Or only project members?
   - Edit task: Creator, assignee, or project owner?
   - Delete task: Creator or project owner?
   - Assign task: Any user? Or only project owner?

4. **Activity tracking** — Should we log all task changes for the activity feed?
   - Option A: Use `updatedAt` timestamp only (simple, already in task)
   - Option B: Create separate `task_activity` collection (detailed history)

5. **Navigation** — How should users navigate between dashboard and kanban?
  - **CONFIRMED: Option B** — Card/button on dashboard only
  - Prominent "Open Task Board" button in task summary section

**Recommended Defaults:**
- **Question 1:** ✅ Option A (all users see all projects)
- **Question 2:** ✅ Toggle between all/my tasks (default: all tasks)
- **Question 3:** ✅ Any authenticated user can create/edit/assign; creator or project owner can delete
- **Question 4:** ✅ Option A (use updatedAt, add activity collection later if needed)
- **Question 5:** ✅ Option B (button on dashboard only)

**CONFIRMED - Ready to begin implementation!**
