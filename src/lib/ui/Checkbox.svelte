<script lang="ts">
	let {
		value = $bindable<boolean>(false),
		id = undefined as string | undefined,
		disabled = false,
		required = false,
		label = null,
		class: className = '',
		children = null,
		...props
	} = $props()

	const controlClasses = $derived([
		// 'h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500',
		// 'disabled:opacity-60 disabled:cursor-not-allowed',
		// "gap-1 border rounded px-2 py-0.5 bg-white "
		'flex gap-1 items-center text-xs whitespace-nowrap',
		className
	])
</script>
<!--
	<span>My Projects</span>
	-->

	<!-- <div class="flex items-center gap-2"> -->
		<label class={controlClasses} >
			<input bind:checked={value} type='checkbox' {id} {disabled} {required} {...props}/>
				{label}
				{@render children?.()}
			</label>
				<!-- aria-invalid={effectiveState === 'error'} -->
				<!-- aria-describedby={hint || error ? describedBy : undefined} -->
		<!-- </div> -->