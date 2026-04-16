<script lang="ts">
	import { Button, Icon, Firestore } from '$lib'
	import { publishPackage } from '$lib/versioning/service'

	let {
		projectId,
		packageId,
		uid,
		db,
		onclose,
	}: {
		projectId: string
		packageId: string
		uid: string
		db: Firestore
		onclose: () => void
	} = $props()

	let publishing = $state(false)
	let error = $state('')
	let result = $state<{ issueId: string; issueCode: string } | null>(null)

	async function handlePublish() {
		publishing = true
		error = ''
		try {
			result = await publishPackage(db, { projectId, packageId, uid })
		} catch (e: any) {
			error = e.message ?? 'Publish failed'
		} finally {
			publishing = false
		}
	}
</script>

<!-- Backdrop -->
<button class="fixed inset-0 bg-black/40 z-50" onclick={onclose} aria-label="Close"></button>

<div class="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
	<div class="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-2xl w-96 pointer-events-auto">
		<div class="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
			<span class="text-sm font-semibold">Publish Package</span>
			<button onclick={onclose} class="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800">
				<Icon name="x" size={16} />
			</button>
		</div>

		<div class="p-4 space-y-3">
			{#if result}
				<!-- Success -->
				<div class="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3 text-center">
					<div class="text-green-700 dark:text-green-300 font-semibold text-sm">Published</div>
					<div class="text-xs text-green-600 dark:text-green-400 mt-1">
						Issue code: <strong>{result.issueCode}</strong>
					</div>
					<p class="text-xs text-zinc-500 mt-2">An immutable manifest has been created. This issue cannot be modified.</p>
				</div>
				<Button onclick={onclose} class="w-full">Close</Button>
			{:else}
				<!-- Confirm -->
				<p class="text-sm text-zinc-600 dark:text-zinc-400">
					This will create an immutable issue record containing all included drawings and their revision snapshots. Published issues cannot be edited or deleted.
				</p>
				<p class="text-xs text-zinc-400">
					If this package was previously published, the new issue will supersede the old one.
				</p>

				{#if error}
					<div class="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-2 text-xs text-red-600 dark:text-red-400">
						{error}
					</div>
				{/if}

				<div class="flex gap-2">
					<Button onclick={onclose} class="flex-1">Cancel</Button>
					<Button onclick={handlePublish} class="flex-1" disabled={publishing}>
						<Icon name="share" size={14} />
						{publishing ? 'Publishing...' : 'Publish Issue'}
					</Button>
				</div>
			{/if}
		</div>
	</div>
</div>
