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

#### Phase 2: Task Card Component (Est. 45 min)

**Step 2.1:** Create TaskCard.svelte
- Props: `task`, `onclick`, `ondragstart`, `ondragend`
- Display:
  - Task title (truncated if long)
  - Priority badge (colored dot/icon)
  - Assignee avatar/initials (if assigned)
  - Due date (with color coding: red if overdue, yellow if due soon)
  - Project name/badge
  - Quick actions: edit, delete icons on hover
- Styling: Match existing UI patterns (rounded border, shadow on hover)
- Draggable: Add `draggable="true"` attribute

**Step 2.2:** Create TaskDialog.svelte
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

#### Phase 3: Kanban Column Component (Est. 30 min)

**Step 3.1:** Create KanbanColumn.svelte
- Props:
  - `status: TaskStatus`
  - `title: string`
  - `tasks: Task[]`
  - `onTaskClick: (task) => void`
  - `onDrop: (task, newStatus) => void`
- Display:
  - Column header with title and count badge
  - Scrollable task list
  - Empty state message ("No tasks")
  - Add task button (+ icon) at top
- Drag & Drop:
  - Accept dragged tasks with `ondrop`, `ondragover`, `ondragenter`, `ondragleave`
  - Highlight column when dragging task over it
  - Call `onDrop()` when task dropped
- Styling:
  - Min width: 280px
  - Max height: calc(100vh - 200px) with overflow-y-auto
  - Background: light gray
  - Border radius, padding

#### Phase 4: Filters Component (Est. 30 min)

**Step 4.1:** Create TaskFilters.svelte
- Props: `projects`, `users`, bindable filters object
- Filters:
  - Project dropdown (with "All Projects" option)
  - Assigned To dropdown (with "All Users", "Unassigned", "Assigned to me")
  - Search input (searches title and description)
  - Status checkboxes (show/hide columns)
  - Clear all filters button
- Layout: Horizontal row with flex gap, wraps on mobile
- Use Search, Select, Button components from `$lib`
- Emit events or bind filter values for reactivity

#### Phase 5: Main Kanban Component (Est. 60 min)

**Step 5.1:** Create Kanban.svelte
- Import: Firestore, Session from context
- Subscribe to data:
  - `projects` collection
  - `tasks` collection (initially all, later filtered)
  - Optional: users collection or derive from tasks
- State:
  - `tasks` — all tasks ($state)
  - `filteredTasks` — derived from tasks and filters ($derived)
  - `filters` — filter state object ($state)
  - `selectedTask` — for edit dialog ($state)
  - `showDialog` — boolean for dialog visibility ($state)
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
- Functions:
  - `handleTaskClick(task)` — open edit dialog
  - `handleTaskDrop(task, newStatus)` — update task status
  - `handleTaskSave(task)` — save to Firestore
  - `handleTaskDelete(taskId)` — delete from Firestore
  - `handleNewTask(status)` — open dialog for new task with preset status
- Layout:
  - Filters bar at top
  - Horizontal scrollable columns container
  - Action buttons: "New Task", refresh, settings

**Step 5.2:** Drag & Drop Logic
- Use native HTML5 drag and drop API (no library needed)
- On drag start: Store task data in event.dataTransfer
- On drop: Update task status in Firestore
- Visual feedback: Add dragging class to card, highlight drop zone
- Ensure drag works across columns

#### Phase 6: Dashboard Integration (Est. 20 min)

**Step 6.1:** Update +page.svelte
- Import Kanban component
- Layout options:

  **Option A: Tabbed View**
  ```svelte
  <Titlebar />
  <div class="flex border-b">
    <button class:active={tab === 'projects'} onclick={() => tab = 'projects'}>Projects</button>
    <button class:active={tab === 'tasks'} onclick={() => tab = 'tasks'}>Tasks</button>
  </div>
  {#if tab === 'projects'}
    <Projects />
  {:else}
    <Kanban />
  {/if}
  ```

  **Option B: Split View** (Recommended)
  ```svelte
  <Titlebar />
  <div class="grid grid-cols-[300px_1fr] h-[calc(100vh-3rem)]">
    <div class="border-r overflow-auto">
      <div class="p-4">
        <h2 class="font-bold mb-2">Projects</h2>
        <!-- Compact project list -->
      </div>
    </div>
    <Kanban />
  </div>
  ```

  **Option C: Full Width Kanban** (Simplest)
  ```svelte
  <Titlebar />
  <Kanban />
  ```

- Choose option based on UX preference (recommend Option B or C)

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
1. `src/lib/types/task.ts` — Foundation
2. `src/routes/dashboard/parts/TaskCard.svelte` — Visual component
3. `src/routes/dashboard/parts/KanbanColumn.svelte` — Container
4. `src/routes/dashboard/parts/TaskFilters.svelte` — Controls
5. `src/routes/dashboard/parts/TaskDialog.svelte` — Form
6. `src/routes/dashboard/Kanban.svelte` — Main logic
7. Update `src/routes/+page.svelte` — Integration

### 9. Estimated Timeline

| Phase | Task | Time |
|-------|------|------|
| 1 | Data layer & types | 30 min |
| 2 | TaskCard + Dialog | 45 min |
| 3 | KanbanColumn | 30 min |
| 4 | TaskFilters | 30 min |
| 5 | Main Kanban | 60 min |
| 6 | Dashboard integration | 20 min |
| 7 | Testing & polish | 45 min |
| **Total** | | **~4 hours** |

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
2. **Create Firestore collection** — Set up `tasks` in Firebase
3. **Start with Phase 1** — Types and data layer
4. **Build incrementally** — Test each component before moving on
5. **Iterate on feedback** — Adjust as needed

---

## Questions to Consider

1. **Layout preference** — Tabbed vs Split vs Full Width for dashboard?
2. **Default view** — Show all tasks or filter to current user by default?
3. **Project selector** — Single project or multi-project view?
4. **Permissions** — Can any user create tasks, or only project owners?
5. **Notifications** — Should users be notified of task assignments? (future feature)
6. **Data retention** — Should completed tasks auto-archive after X days?

Let me know which options you prefer, and I can begin implementation!
