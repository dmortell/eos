# Presence Implementation Plan

## Overview
Show active users in the Titlebar with overlapping avatars + overflow dropdown. Track activity via mouse movement on `document`, stored in a single Firestore doc `settings/presence`.

## Firestore Schema

**Document:** `settings/presence`

```ts
{
  users: {
    [uid: string]: {
      displayName: string
      photoURL: string | null
      lastActive: Timestamp
    }
  }
}
```

Single doc for the whole app. Each user writes their entry under `users.{uid}` via `setDoc(merge: true)`. No indexes needed.

## Files to Create/Modify

### 1. `src/lib/presence/presence.svelte.ts` — Presence tracker

Module-level reactive state + functions (no class):

```ts
import { doc, setDoc, onSnapshot, serverTimestamp, deleteField } from 'firebase/firestore'
import { firestore } from '$lib/db.svelte'

export interface PresenceUser {
  uid: string
  displayName: string
  photoURL: string | null
  lastActive: Date
}

// Reactive state
export let activeUsers = $state<PresenceUser[]>([])

// Private
let unsub: (() => void) | null = null
let lastWrite = 0
let trailingTimer: ReturnType<typeof setTimeout> | null = null
let inactivityTimer: ReturnType<typeof setTimeout> | null = null
let currentUid: string | null = null
const THROTTLE = 3000
const INACTIVE = 5 * 60 * 1000
const docRef = doc(firestore, 'settings', 'presence')
```

**Exported functions:**

- `startPresence(user: User)` — Sets `currentUid`, writes initial entry, subscribes to doc snapshot, attaches `document.addEventListener('mousemove', onMouseMove)`, starts inactivity timer, adds `beforeunload` listener
- `stopPresence()` — Removes user entry (`deleteField()`), unsubscribes snapshot, removes mousemove + beforeunload listeners, clears timers

**Internal functions:**

- `onMouseMove()` — Throttled at 3000ms (leading + trailing edge). Writes `{ users: { [uid]: { displayName, photoURL, lastActive: serverTimestamp() } } }` via `setDoc(merge: true)`. Resets 5-min inactivity timer each time
- `markInactive()` — Called by inactivity timer. Writes `{ users: { [uid]: deleteField() } }` to remove entry
- `onSnapshot` callback — Reads `users` map from doc, filters entries with `lastActive` older than 5 min, excludes `currentUid`, sorts by `lastActive` desc, assigns to `activeUsers`

**Mouse detection:** Listener on `document` level. Captures all mouse activity regardless of page/component. Attached in `startPresence()`, removed only in `stopPresence()` (sign-out).

**Inactivity → re-activation:** `markInactive()` removes the Firestore entry and unsubscribes the snapshot, but keeps the mousemove listener alive. When the mouse moves again after idle, `onMouseMove` fires → `writePresence()` re-creates the entry and re-subscribes automatically.

**Cleanup:** `beforeunload` only. No `beforeNavigate` — SPA navigation keeps the tab alive.

### 2. `src/lib/ui/Avatar.svelte` — Reusable avatar component

```svelte
<script lang="ts">
  let {
    name,
    photoURL = null,
    size = 'sm',
    border = 'border-gray-800',
  }: {
    name: string
    photoURL?: string | null
    size?: 'sm' | 'md' | 'lg'
    border?: string
  } = $props()

  const sizes = { sm: 'w-6 h-6 text-xs', md: 'w-8 h-8 text-sm', lg: 'w-10 h-10 text-base' }
</script>

{#if photoURL}
  <img src={photoURL} alt={name} title={name}
    class="rounded-full border-2 {border} object-cover {sizes[size]}" />
{:else}
  <div class="rounded-full border-2 {border} bg-blue-500 text-white
    flex items-center justify-center font-semibold {sizes[size]}"
    title={name}>
    {name[0]?.toUpperCase() ?? '?'}
  </div>
{/if}
```

Exported from `$lib/index.ts` barrel for use anywhere.

### 3. `src/lib/presence/PresenceAvatars.svelte` — Titlebar avatar strip

```svelte
<script lang="ts">
  import { activeUsers } from './presence.svelte'
  import Avatar from '$lib/ui/Avatar.svelte'

  let showDropdown = $state(false)
  let container: HTMLDivElement
  let visible = $derived(activeUsers.slice(0, 3))
  let overflow = $derived(Math.max(0, activeUsers.length - 3))

  $effect(() => {
    if (!showDropdown) return
    const onClick = (e: MouseEvent) => {
      if (container && !container.contains(e.target as Node)) showDropdown = false
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  })
</script>

{#if activeUsers.length > 0}
  <div class="relative flex items-center ml-2 pl-2 border-l border-gray-600" bind:this={container}>
    <div class="flex -space-x-2">
      {#each visible as user (user.uid)}
        <Avatar name={user.displayName} photoURL={user.photoURL} />
      {/each}
    </div>

    {#if overflow > 0}
      <button class="ml-1 text-xs text-gray-300 hover:text-white cursor-pointer"
        onclick={() => showDropdown = !showDropdown}>+{overflow}</button>
    {/if}

    {#if showDropdown}
      <div class="absolute top-full right-0 mt-1 bg-white text-gray-800 rounded shadow-lg p-2 z-50 min-w-48">
        {#each activeUsers as user (user.uid)}
          <div class="flex items-center gap-2 py-1 px-2">
            <Avatar name={user.displayName} photoURL={user.photoURL} />
            <span class="text-sm">{user.displayName}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}
```

### 4. `src/lib/ui/Titlebar.svelte` — Add presence avatars

After the Sign Out button, before the save-status div:

```svelte
import PresenceAvatars from '$lib/presence/PresenceAvatars.svelte'

<!-- in the Row, after sign out/in button -->
<PresenceAvatars />
```

### 5. Presence started in Titlebar

`Titlebar.svelte` already has `session` via `getContext`. An `$effect` there calls `startPresence(session.user)` when logged in, `stopPresence()` on sign-out. No per-page wiring needed — Titlebar is on every page.

## Implementation Order

1. `presence.svelte.ts` — Core tracker
2. `Avatar.svelte` — Reusable component in `$lib/ui/`
3. `PresenceAvatars.svelte` — Avatar strip
4. `Titlebar.svelte` — Mount PresenceAvatars
5. Start presence in layout/page `$effect`
6. Add Avatar to `$lib/index.ts` barrel

## Firestore Considerations

- **Single doc** `settings/presence` — simple, no indexes, no extra collections
- **Merge writes** — `setDoc(ref, { users: { [uid]: data } }, { merge: true })` touches only one user's entry
- **Cleanup** — `deleteField()` on leave/idle; stale entries filtered client-side (>5 min)
- **No TTL needed** — Entries are tiny; stale ones are harmless and overwritten on next visit

## Edge Cases

- Multiple tabs: Same uid key, latest tab wins (fine)
- Browser crash: No cleanup call; entry expires visually after 5 min for other clients
- Sign out: `stopPresence()` in the `$effect` cleanup when `session.user` becomes null
