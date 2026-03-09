<script lang="ts">
	import { presence } from './presence.svelte'
	import Avatar from '$lib/ui/Avatar.svelte'

	let showDropdown = $state(false)
	let container: HTMLDivElement
	let visible = $derived(presence.users.slice(0, 3))
	let overflow = $derived(Math.max(0, presence.users.length - 3))

	$effect(() => {
		if (!showDropdown) return
		const onClick = (e: MouseEvent) => {
			if (container && !container.contains(e.target as Node)) showDropdown = false
		}
		document.addEventListener('click', onClick)
		return () => document.removeEventListener('click', onClick)
	})
</script>

{#if presence.users.length > 0}
	<div class="relative flex items-center ml-2 pl-2 border-l border-gray-600" bind:this={container}>
		<div class="flex -space-x-2">
			{#each visible as user (user.uid)}
				<Avatar name={user.displayName} email={user.email} photoURL={user.photoURL} />
			{/each}
		</div>

		{#if overflow > 0}
			<button class="ml-1 text-xs text-gray-300 hover:text-white cursor-pointer"
				onclick={() => { showDropdown = !showDropdown }}>+{overflow}</button>
		{/if}

		{#if showDropdown}
			<div class="absolute top-full right-0 mt-1 bg-white text-gray-800 rounded shadow-lg p-2 z-50 min-w-48">
				{#each presence.users as user (user.uid)}
					<div class="flex items-center gap-2 py-1 px-2">
						<Avatar name={user.displayName} email={user.email} photoURL={user.photoURL} border="border-white" />
						<span class="text-sm">{user.displayName}</span>
					</div>
				{/each}
			</div>
		{/if}
	</div>
{/if}
