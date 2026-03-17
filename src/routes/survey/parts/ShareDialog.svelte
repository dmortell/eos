<script lang="ts">
	import { Button, Dialog, Icon, Input } from '$lib'
	import { updateSurvey } from '../survey.svelte'
	import { nanoid } from 'nanoid'
	import type { Survey } from '../types'

	let {
		survey,
		open = $bindable(false),
	}: {
		survey: Survey
		open: boolean
	} = $props()

	let copied = $state(false)

	let shareUrl = $derived(
		survey.shareToken ? `${window.location.origin}/survey/share/${survey.shareToken}` : ''
	)

	async function togglePublic() {
		if (survey.isPublic) {
			await updateSurvey({ id: survey.id, isPublic: false, shareToken: undefined })
		} else {
			const token = survey.shareToken || nanoid(12)
			await updateSurvey({ id: survey.id, isPublic: true, shareToken: token })
		}
	}

	async function copyLink() {
		if (!shareUrl) return
		await navigator.clipboard.writeText(shareUrl)
		copied = true
		setTimeout(() => (copied = false), 2000)
	}
</script>

<Dialog title="Share Album" bind:open>
	<div class="space-y-4">
		<div class="flex items-center justify-between">
			<span class="text-sm">Make album public</span>
			<button
				type="button"
				class="h-6 w-11 rounded-full transition-colors {survey.isPublic ? 'bg-blue-600' : 'bg-gray-300'}"
				onclick={togglePublic}
			>
				<div class="h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition-transform {survey.isPublic ? 'translate-x-[22px]' : ''}"></div>
			</button>
		</div>

		{#if survey.isPublic && shareUrl}
			<div class="space-y-2">
				<label class="text-xs font-medium text-gray-600">Share link</label>
				<div class="flex gap-2">
					<Input value={shareUrl} disabled class="flex-1 text-xs" />
					<Button variant="outline" icon={copied ? 'check' : 'copy'} onclick={copyLink}>
						{copied ? 'Copied' : 'Copy'}
					</Button>
				</div>
			</div>
		{/if}
	</div>
</Dialog>
