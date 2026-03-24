<script lang="ts" module>
	export type InputSize = 'sm' | 'md' | 'lg'
	export type InputState = 'default' | 'error' | 'success'
</script>

<script lang="ts">
	function cx(...parts: Array<string | false | null | undefined>) {
		return parts.filter(Boolean).join(' ')
	}

	let {
		class: className = '',
		value = $bindable<string>(''),
		type = 'text',
		multiline = false,
		size = 'md' as InputSize,
		state = 'default' as InputState,
		label = null as string | null,
		hint = null as string | null,
		error = null as string | null,
		disabled = false,
		required = false,
		id = undefined as string | undefined,
		title = undefined as string | undefined,
		rows = 4,
		children = null,
		...props
	} = $props()

	let isTextarea = $derived(multiline || type === 'textarea')
	let hasLabel = $derived(Boolean(label) || children !== null)
	let effectiveState = $derived((error ? 'error' : state) as InputState)
	let describedBy = $derived(id ? `${id}-hint` : undefined)

	const sizeClasses: Record<InputSize, string> = {
		sm: 'h-7 px-2 text-xs rounded',
		md: 'h-7 px-2 py-0 xxtext-sm rounded',
		lg: 'h-10 px-3.5 text-sm rounded-md'
	}

	const textareaSizeClasses: Record<InputSize, string> = {
		sm: 'min-h-20 px-2 py-1.5 text-xs rounded',
		md: 'min-h-24 px-3 py-2 text-sm rounded',
		lg: 'min-h-28 px-3.5 py-2.5 text-sm rounded-md'
	}

	const stateClasses: Record<InputState, string> = {
		default: 'border-gray-300    bg-white text-gray-800 placeholder:text-gray-400 focus-visible:ring-blue-300 focus-visible:border-blue-500',
		error:   'border-red-400     bg-red-50/30 text-red-900 placeholder:text-red-300 focus-visible:ring-red-300 focus-visible:border-red-500',
		success: 'border-emerald-400 bg-emerald-50/30 text-emerald-900 placeholder:text-emerald-400 focus-visible:ring-emerald-300 focus-visible:border-emerald-500'
	}

	let controlClasses = $derived(cx(
		'w-full border transition-colors duration-150',
		'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
		'disabled:opacity-60 disabled:cursor-not-allowed',
		isTextarea ? textareaSizeClasses[size] : sizeClasses[size],
		stateClasses[effectiveState],
		className
	))

	let labelClasses = $derived(cx(
		'block text-xs font-medium leading-none',
		effectiveState === 'error' ? 'text-red-700' : effectiveState === 'success' ? 'text-emerald-700' : 'text-gray-600'
	))

	let helperClasses = $derived(cx(
		'mt-1 text-[11px] leading-tight',
		error ? 'text-red-600' : effectiveState === 'success' ? 'text-emerald-600' : 'text-gray-500'
	))
</script>

<label class={[size=="lg" && 'w-full', "flex flex-col gap-1"]} {title}>
	{#if hasLabel}
		<span class={labelClasses}>
			{label}
			{@render children?.()}
			{#if required}
				<span class="ml-1 text-red-600">*</span>
			{/if}
		</span>
	{/if}

	{#if isTextarea}
		<textarea bind:value {id} {disabled} {required} {rows}
			class={controlClasses}
			aria-invalid={effectiveState === 'error'}
			aria-describedby={hint || error ? describedBy : undefined}
			{...props}
		></textarea>
	{:else}
		<input bind:value {id} {type} {disabled} {required}
			class={controlClasses}
			aria-invalid={effectiveState === 'error'}
			aria-describedby={hint || error ? describedBy : undefined}
			{...props}
		/>
	{/if}

	{#if hint || error}
		<p id={describedBy} class={helperClasses}>{error ?? hint}</p>
	{/if}
</label>