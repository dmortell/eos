<script lang="ts" module>
	export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'link'
	export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'icon'
	export type ButtonConfirm = {
		text?: string
		confirmLabel?: string
		cancelLabel?: string
	}
</script>

<script lang="ts">
	import { Icon } from '$lib'

	function cx(...parts: Array<string | false | null | undefined>) {
		return parts.filter(Boolean).join(' ')
	}

	let {
		class: className = '',
		variant = 'secondary' as ButtonVariant,
		size = 'md' as ButtonSize,
		loading = false,
		icon = null as string | null,
		iconOnly = false,
		confirm = null as ButtonConfirm | null,
		href = null as string | null,
		active = false,
		group = false,
		disabled = false,
		type: buttonType = 'button' as 'button' | 'reset' | 'submit',
		onclick = null as ((event: MouseEvent) => void) | null,
		children = null,
		...props
	} = $props()

	let awaitingConfirm = $state(false)

	const sizeClasses: Record<ButtonSize, string> = {
		xs: 'h-5 min-w-5 px-1.5 text-[10px] gap-1 rounded',
		sm: 'h-7 min-w-7 px-2 text-xs gap-1.5 rounded-md',
		md: 'h-8 min-w-8 px-3 text-sm gap-1.5 rounded-md',
		lg: 'h-10 min-w-10 px-4 text-sm gap-2 rounded-md',
		icon: 'h-8 w-8 rounded-md p-0'
	}

	const iconOnlyClasses: Record<ButtonSize, string> = {
		xs: 'w-5 px-0',
		sm: 'w-7 px-0',
		md: 'w-8 px-0',
		lg: 'w-10 px-0',
		icon: 'w-8 px-0'
	}

	const iconSizes: Record<ButtonSize, number> = {
		xs: 12,
		sm: 14,
		md: 16,
		lg: 18,
		icon: 16
	}

	const variantClasses: Record<ButtonVariant, string> = {
		primary: 'border border-blue-600 bg-blue-600 text-white shadow-sm hover:bg-blue-500 hover:border-blue-500 focus-visible:ring-blue-300',
		secondary: 'border border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200 hover:border-slate-400 focus-visible:ring-slate-300',
		outline: 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-400 focus-visible:ring-gray-300',
		ghost: 'border border-transparent bg-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus-visible:ring-gray-300',
		danger: 'border border-red-600 bg-red-600 text-white shadow-sm hover:bg-red-500 hover:border-red-500 focus-visible:ring-red-300',
		link: 'border border-transparent bg-transparent px-0 text-blue-700 underline-offset-2 hover:underline focus-visible:ring-blue-300'
	}

	let isDisabled = $derived(Boolean(disabled || loading))
	let resolvedIconSize = $derived(iconSizes[size])
	let confirmText = $derived(confirm?.text ?? 'Confirm')
	let confirmLabel = $derived(confirm?.confirmLabel ?? 'Yes')
	let cancelLabel = $derived(confirm?.cancelLabel ?? 'Cancel')
	let rootClasses = $derived(cx(
		'inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap select-none transition-colors duration-150',
		'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
		(isDisabled || href && !href) && 'pointer-events-none opacity-50',
		group && 'rounded-none first:rounded-l-md last:rounded-r-md -ml-px',
		!group && variant !== 'link' && 'shadow-[0_1px_0_rgba(255,255,255,0.25)_inset]',
		variantClasses[variant],
		sizeClasses[size],
		iconOnly && iconOnlyClasses[size],
		active && variant === 'primary' && 'ring-2 ring-blue-200',
		active && variant === 'danger' && 'ring-2 ring-red-200',
		active && ['secondary', 'outline', 'ghost'].includes(variant) && 'bg-blue-50 border-blue-300 text-blue-700',
		active && variant === 'link' && 'text-blue-900',
		className
	))
	let contentClasses = $derived(cx('inline-flex items-center justify-center', iconOnly ? '' : 'gap-1.5'))
	let cancelClasses = $derived(cx(
		'inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-500 transition-colors',
		'hover:bg-gray-50 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-2'
	))

	function handlePrimaryClick(event: MouseEvent) {
		if (isDisabled) {
			event.preventDefault()
			return
		}

		if (confirm && !awaitingConfirm) {
			event.preventDefault()
			event.stopPropagation()
			awaitingConfirm = true
			return
		}

		onclick?.(event)
	}

	function handleConfirmedClick(event: MouseEvent) {
		awaitingConfirm = false
		onclick?.(event)
	}

	function handleCancelClick(event: MouseEvent) {
		event.preventDefault()
		event.stopPropagation()
		awaitingConfirm = false
	}
</script>

{#if awaitingConfirm && confirm}
	<span class="inline-flex items-center gap-1 align-middle">
		{#if href}
			<a
				class={rootClasses}
				href={isDisabled ? undefined : href}
				aria-disabled={isDisabled}
				aria-busy={loading}
				role={isDisabled ? 'link' : undefined}
				tabindex={isDisabled ? -1 : undefined}
				onclick={handleConfirmedClick}
				{...props}
			>
				<span class={contentClasses}>
					{#if loading}
						<Icon name="spinner" size={resolvedIconSize} class="animate-spin" />
					{:else}
						{#if icon}
							<Icon name={icon} size={resolvedIconSize} />
						{/if}
					{/if}
					<span>{confirmText}</span>
				</span>
			</a>
		{:else}
			<button
				class={rootClasses}
				type={buttonType}
				disabled={isDisabled}
				aria-busy={loading}
				onclick={handleConfirmedClick}
				{...props}
			>
				<span class={contentClasses}>
					{#if loading}
						<Icon name="spinner" size={resolvedIconSize} class="animate-spin" />
					{:else}
						{#if icon}
							<Icon name={icon} size={resolvedIconSize} />
						{/if}
					{/if}
					<span>{confirmText}</span>
				</span>
			</button>
		{/if}
		<button type="button" class={cancelClasses} aria-label={cancelLabel} title={cancelLabel} onclick={handleCancelClick}>
			<Icon name="close" size={14} />
		</button>
	</span>
{:else if href}
	<a
		class={rootClasses}
		href={isDisabled ? undefined : href}
		aria-disabled={isDisabled}
		aria-busy={loading}
		role={isDisabled ? 'link' : undefined}
		tabindex={isDisabled ? -1 : undefined}
		onclick={handlePrimaryClick}
		{...props}
	>
		<span class={contentClasses}>
			{#if loading}
				<Icon name="spinner" size={resolvedIconSize} class="animate-spin" />
			{:else}
				{#if icon}
					<Icon name={icon} size={resolvedIconSize} />
				{/if}
			{/if}
			{#if !iconOnly}
				{@render children?.()}
			{/if}
		</span>
	</a>
{:else}
	<button
		class={rootClasses}
		type={buttonType}
		disabled={isDisabled}
		aria-busy={loading}
		onclick={handlePrimaryClick}
		{...props}
	>
		<span class={contentClasses}>
			{#if loading}
				<Icon name="spinner" size={resolvedIconSize} class="animate-spin" />
			{:else}
				{#if icon}
					<Icon name={icon} size={resolvedIconSize} />
				{/if}
			{/if}
			{#if !iconOnly}
				{@render children?.()}
			{/if}
		</span>
	</button>
{/if}