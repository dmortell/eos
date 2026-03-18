<script lang="ts">
	import { Dialog, Input } from '$lib'

	let {
		open = $bindable(false),
		title = 'Survey',
		name = $bindable(''),
		date = $bindable(''),
		saving = false,
		onsave,
	}: {
		open: boolean
		title?: string
		name: string
		date: string
		saving?: boolean
		onsave: () => void
	} = $props()
</script>

<Dialog {title} bind:open>
	<div class="space-y-3">
		<Input bind:value={name} label="Survey name" placeholder="e.g. Building A - Floor 1" size="lg" />
		<Input bind:value={date} label="Date" type="date" size="lg" />
		<div class="flex justify-end gap-2 pt-2">
			<button type="button" class="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium active:bg-gray-100" onclick={() => (open = false)}>Cancel</button>
			<button type="button" class="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white active:bg-blue-500 disabled:opacity-50" disabled={!name.trim() || saving} onclick={onsave}>
				{saving ? 'Saving...' : 'Save'}
			</button>
		</div>
	</div>
</Dialog>
