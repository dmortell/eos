# Presence Implementation Plan

## Overview
Show active users in the Titlebar with overlapping avatars + overflow dropdown. Track activity via mouse movement, stored in a Firestore `presence/{pid}` field.

## Firestore Schema

**Collection:** `presence` → **Document:** `{pid}` (project ID)

```ts
// presence/{pid}
{
  users: {
    [uid: string]: {
      displayName: string
      photoURL: string | null
      lastActive: Timestamp    // serverTimestamp on each update
    }
  }
}
```

Single document per project. Each user writes their entry under `users.{uid}`. No composite indexes needed — just read the whole doc.

## Files to Create

### 1. `src/lib/presence/presence.svelte.ts` — Presence tracker (reactive module)

State & logic, no class needed (module-level `$state`):

```ts
import { doc, setDoc, onSnapshot, serverTimestamp, deleteField } from 'firebase/firestore'
import { firestore } from '$lib/db.svelte'

// State
let activeUsers = $state<PresenceUser[]>([])  // exported, reactive
let unsubscribe: (() => void) | null = null
let throttleTimer: number | null = null
let lastUpdate = 0
let inactivityTimer: number | null = null
let currentPid: string | null = null
let currentUid: string | null = null

interface PresenceUser {
  uid: string
  displayName: string
  photoURL: string | null
  lastActive: Date
}
```

**Key functions:**

- `startPresence(pid, user)` — Write user entry to `presence/{pid}.users.{uid}`, subscribe to doc, attach mousemove listener, start inactivity timer
- `stopPresence()` — Remove user entry (`deleteField()`), unsubscribe, remove listeners, clear timers
- `handleMouseMove()` — Throttled at 3000ms. Writes `{ users.{uid}: { displayName, photoURL, lastActive: serverTimestamp() } }` via `setDoc(merge: true)`. Resets 5-min inactivity timer
- `markInactive()` — Called after 5 min idle. Removes user entry from doc with `deleteField()`
- `onDocSnapshot(snap)` — Parse `users` map, filter out entries with `lastActive` older than 5 min, exclude self, sort by lastActive desc, update `activeUsers`

**Throttle:** Track `lastUpdate` timestamp. On mousemove, if `Date.now() - lastUpdate >= 3000`, write immediately and reset. Otherwise skip. Use trailing-edge timeout so the last move before idle is captured.

**Cleanup:** `beforeunload` listener calls `stopPresence()`. Also call `stopPresence()` on page navigation (SvelteKit `beforeNavigate`).

### 2. `src/lib/presence/PresenceAvatars.svelte` — Avatar bar component

Props: none (imports reactive `activeUsers` from module)

```svelte
<script lang="ts">
  import { activeUsers } from './presence.svelte'

  let showDropdown = $state(false)
  let visible = $derived(activeUsers.slice(0, 3))
  let overflow = $derived(activeUsers.length - 3)
</script>

{#if activeUsers.length > 0}
  <div class="relative flex items-center ml-2 pl-2 border-l border-gray-600">
    <div class="flex -space-x-2">
      {#each visible as user (user.uid)}
        <!-- Avatar: photo or initial -->
        {#if user.photoURL}
          <img src={user.photoURL} alt={user.displayName} title={user.displayName}
            class="w-6 h-6 rounded-full border-2 border-gray-800 object-cover" />
        {:else}
          <div class="w-6 h-6 rounded-full border-2 border-gray-800 bg-blue-500
            text-white text-xs flex items-center justify-center font-semibold"
            title={user.displayName}>
            {user.displayName[0]?.toUpperCase()}
          </div>
        {/if}
      {/each}
    </div>

    {#if overflow > 0}
      <button class="ml-1 text-xs text-gray-300 hover:text-white"
        onclick={() => showDropdown = !showDropdown}>
        +{overflow}
      </button>
    {/if}

    {#if showDropdown}
      <!-- Dropdown list of all users -->
      <div class="absolute top-full right-0 mt-1 bg-white text-gray-800 rounded shadow-lg p-2 z-50 min-w-48">
        {#each activeUsers as user (user.uid)}
          <div class="flex items-center gap-2 py-1 px-2">
            <!-- same avatar + displayName -->
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}
```

Click-outside closes dropdown (use `$effect` with document listener, same pattern as sample).

### 3. Integrate into `src/lib/ui/Titlebar.svelte`

Add `PresenceAvatars` after the Sign Out button, before the save status div:

```svelte
<script>
  import PresenceAvatars from '$lib/presence/PresenceAvatars.svelte'
</script>

<!-- After sign out button -->
<PresenceAvatars />
```

### 4. Start/stop presence in page components

In each `+page.svelte` or main component that has a project context:

```svelte
<script>
  import { startPresence, stopPresence } from '$lib/presence/presence.svelte'
  import { beforeNavigate } from '$app/navigation'
  import { onDestroy } from 'svelte'

  // Start when user and pid are available
  $effect(() => {
    if (session.user && pid) {
      startPresence(pid, session.user)
    }
    return () => stopPresence()
  })

  beforeNavigate(() => stopPresence())
</script>
```

## Implementation Order

1. `presence.svelte.ts` — Core tracker with Firestore read/write, throttle, inactivity
2. `PresenceAvatars.svelte` — UI component
3. `Titlebar.svelte` — Mount the component
4. Page integration — Wire up start/stop in project pages

## Firestore Considerations

- **No extra collection** — uses single doc per project, avoids index requirements
- **Merge writes** — `setDoc(ref, { users: { [uid]: data } }, { merge: true })` only touches one user's entry
- **Cleanup** — `deleteField()` on the user's key when leaving or going idle
- **Stale entries** — Snapshot listener filters out entries older than 5 min client-side. If a user's browser crashes without cleanup, their entry auto-expires visually for all other clients
- **No server-side TTL needed** — Entries are small; stale ones are harmless and get overwritten on next visit

## Edge Cases

- Multiple tabs: Same uid overwrites same key — latest tab wins (acceptable)
- User signs out: `stopPresence()` in auth state change handler
- Network disconnect: Firestore SDK reconnects automatically; stale lastActive gets filtered client-side
