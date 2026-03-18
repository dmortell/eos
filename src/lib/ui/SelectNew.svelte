<script lang="ts" module>
	export type SelectSize = 'sm' | 'md' | 'lg'
	export type SelectState = 'default' | 'error' | 'success'
</script>

<script lang="ts">
	import { Icon } from '$lib'

	function cx(...parts: Array<string | false | null | undefined>) {
		return parts.filter(Boolean).join(' ')
	}

	let {
		class: className = '',
		value = $bindable<string>(''),
		size = 'md' as SelectSize,
		state = 'default' as SelectState,
		label = null as string | null,
		hint = null as string | null,
		error = null as string | null,
		placeholder = null as string | null,
		disabled = false,
		required = false,
		id = undefined as string | undefined,
		title = undefined as string | undefined,
		children = null,
		...props
	} = $props()

	let hasLabel = $derived(Boolean(label) || children !== null)
	let effectiveState = $derived((error ? 'error' : state) as SelectState)
	let describedBy = $derived(id ? `${id}-hint` : undefined)

	const sizeClasses: Record<SelectSize, string> = {
		sm: 'h-7 px-2 pr-7 text-xs rounded',
		md: 'h-8 px-3 pr-8 text-sm rounded',
		lg: 'h-10 px-3.5 pr-9 text-sm rounded-md'
	}

	const stateClasses: Record<SelectState, string> = {
		default: 'border-gray-300 bg-white text-gray-800 focus-visible:ring-blue-300 focus-visible:border-blue-500',
		error: 'border-red-400 bg-red-50/30 text-red-900 focus-visible:ring-red-300 focus-visible:border-red-500',
		success: 'border-emerald-400 bg-emerald-50/30 text-emerald-900 focus-visible:ring-emerald-300 focus-visible:border-emerald-500'
	}

	let controlClasses = $derived(cx(
		'w-full appearance-none border transition-colors duration-150',
		'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
		'disabled:opacity-60 disabled:cursor-not-allowed',
		sizeClasses[size],
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

	let iconSize = $derived(size === 'sm' ? 13 : 15)
	let iconWrapperClasses = $derived(cx(
		'pointer-events-none absolute inset-y-0 right-0 flex items-center text-gray-500',
		size === 'sm' ? 'pr-2' : size === 'lg' ? 'pr-3' : 'pr-2.5'
	))
</script>

<label class="flex flex-col gap-1" {title}>
	{#if hasLabel}
		<span class={labelClasses}>
			{label}
			<!-- {@render children?.()} -->
			{#if required}
				<span class="ml-1 text-red-600">*</span>
			{/if}
		</span>
	{/if}

	<div class="relative">
		<select
			bind:value
			{id}
			{disabled}
			{required}
			class={controlClasses}
			aria-invalid={effectiveState === 'error'}
			aria-describedby={hint || error ? describedBy : undefined}
			{...props}
		>
			{#if placeholder}
				<option value="" disabled={required}>{placeholder}</option>
			{/if}
			{@render children?.()}
		</select>
		<span class={iconWrapperClasses}>
			<Icon name="chevronDown" size={iconSize} />
		</span>
	</div>

	{#if hint || error}
		<p id={describedBy} class={helperClasses}>{error ?? hint}</p>
	{/if}
</label>