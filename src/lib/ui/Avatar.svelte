<script lang="ts">
	let {
		name,
		email = '',
		photoURL = null,
		size = 'sm',
		border = 'border-gray-800',
	}: {
		name: string
		email?: string
		photoURL?: string | null
		size?: 'sm' | 'md' | 'lg'
		border?: string
	} = $props()

	const sizes = { sm: 'w-6 h-6 text-[9px]', md: 'w-8 h-8 text-xs', lg: 'w-10 h-10 text-sm' }

	let initials = $derived.by(() => {
		if (!name) return '?'
		const parts = name.trim().split(/\s+/)
		if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
		return parts[0][0].toUpperCase()
	})

	let tip = $derived(email || name)
</script>

{#if photoURL}
	<img src={photoURL} alt={name} title={tip}
		class="rounded-full border-2 {border} object-cover {sizes[size]}" />
{:else}
	<div class="rounded-full border-2 {border} bg-blue-500 text-white
		flex items-center justify-center font-semibold {sizes[size]}"
		title={tip}>
		{initials}
	</div>
{/if}
