<script lang="ts">
	import { Dropdown, Icon, Row, Session, Spinner } from '$lib'
	import { ModeWatcher, toggleMode } from "mode-watcher";
	import { getContext, type Snippet } from 'svelte';
	import PresenceAvatars from '$lib/presence/PresenceAvatars.svelte'
	import { startPresence, stopPresence } from '$lib/presence/presence.svelte'
  import { updated } from '$app/state';		// For update notifications. Polling interval is set in svelte.config.js

  const menuItems = [
		{ label: 'Racks', href: 'racks' },
		{ label: 'Frames', href: 'frames' },
		{ label: 'Floorplans', href: 'outlets' },
	]
	let {title="EOS 0.3", height=null, children=null, menu=null, saveStatus=''}: {
		title?: string
		height?: number | null
		children?: Snippet | null
		menu?: boolean | null
		saveStatus?: string
	} = $props()
	let session = getContext('session') as Session

	$effect(() => {
		if (session.user) {
			startPresence(session.user)
		} else {
			stopPresence()
		}
	})
</script>

<ModeWatcher />

<header style="height:{height}px" class="header print:hidden bg-gray-800 text-white text-sm px-4 py-1 flex justify-between items-center">
	<a href='/' title="Back to Dashboard" class="flex gap-2 items-center"><Icon name=home/> {title}</a>
	<div>{@render children?.()}</div>

	<Row class="flex items-center gap-1">
		{#if menu}
			{#each menuItems as item}<a href={item.href} class="rounded hover:text-gray-200 px-2">{item.label}</a>{/each}
			&middot;
		{/if}
		{#if session.user}
			<button class="cursor-pointer rounded hover:text-gray-200 px-2" onclick={session.logout} title='Sign out {session.user.email}'>Sign Out</button>
			{#if updated.current}
				<button onclick={()=>location.reload()} class="bg-blue-500 text-white px-2 py-1 rounded" title="A new version is available. Click to refresh.">Refresh</button>
			{/if}
			<PresenceAvatars />
		{:else if session.user!==undefined}
			<button class="cursor-pointer rounded hover:text-gray-200 px-2" onclick={e=>session.login('google')} title='Sign in with Google'>Sign In</button>
		{/if}

		<!-- <button onclick={toggleMode} class="h-6 w-7 rounded bg-gray-800 relative" title="Light/dark mode">
			<Icon name=sun class="h-5 scale-100 rotate-0 transition-all! dark:scale-0 dark:-rotate-45 absolute"/>
			<Icon name=moon class="h-5 scale-0 rotate-90 transition-all! dark:scale-100 dark:rotate-0"/>
			<span class="sr-only">Toggle theme</span>
		</button> -->

		<div class="flex items-center gap-2 text-xs">
			<span class="text-gray-400">
				{#if saveStatus === 'saved'}o{:else if saveStatus === 'saving'}!{:else if 0 || saveStatus!=''}/{/if}
			</span>
		</div>

	</Row>
</header>
