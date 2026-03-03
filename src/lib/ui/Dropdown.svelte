<script lang="ts">
  import { Button, Icon } from '$lib'
	let {class:className=null, name, value=$bindable(), dropdown=null, children=null, ...props} = $props()

	let dropdownEl: HTMLDivElement | undefined
	let triggerEl: HTMLDivElement | undefined
	let dropdownStyle = $state('')

	function toggle(ev: Event) {
		value = value===name ? null : name
		if (value === name) updatePosition()
	}

	function updatePosition() {
		if (!triggerEl) return
		const rect = triggerEl.getBoundingClientRect()
		// Position below the trigger, align right edge
		const top = rect.bottom + 4
		const right = window.innerWidth - rect.right
		dropdownStyle = `position:fixed; top:${top}px; right:${right}px; z-index:9999;`
	}

	function onClickOutside(e: MouseEvent) {
		if (value !== name) return
		if (dropdownEl && !dropdownEl.contains(e.target as Node)) value = null
	}
</script>

<svelte:window onclick={onClickOutside} />

<div class="relative inline-flex items-center" bind:this={dropdownEl}>
	<div bind:this={triggerEl}>
		<Button dropdown onclick={toggle} {name}>{@render children?.()}</Button>
	</div>
	{#if value==name}
	<div class="bg-white rounded shadow-lg border" style={dropdownStyle}>
		{@render dropdown?.()}
	</div>
	{/if}
</div>
