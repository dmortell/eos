<script lang="ts">
	import { Icon, Input } from '$lib'

	let {
		value = $bindable(''),
		label = null as string | null,
		placeholder = '',
		multiline = false,
		rows = 3,
	} = $props()

	let listening = $state(false)
	let supported = $state(false)
	let recognition: any = null

	$effect(() => {
		supported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window
		return () => stopListening()
	})

	function startListening() {
		const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
		if (!SpeechRecognition) return
		recognition = new SpeechRecognition()
		recognition.lang = 'ja'
		recognition.continuous = true
		recognition.interimResults = false
		recognition.onresult = (e: any) => {
			const transcript = Array.from(e.results as SpeechRecognitionResultList)
				.map((r: any) => r[0].transcript)
				.join('')
			if (transcript) {
				value = value ? value + ' ' + transcript : transcript
			}
		}
		recognition.onerror = () => { listening = false }
		recognition.onend = () => { listening = false }
		recognition.start()
		listening = true
	}

	function stopListening() {
		recognition?.stop()
		recognition = null
		listening = false
	}

	function toggleVoice() {
		if (listening) stopListening()
		else startListening()
	}
</script>

<div class="flex items-end gap-1.5">
	<div class="flex-1">
		<Input bind:value {label} {placeholder} {multiline} {rows} />
	</div>
	{#if supported}
		<button
			type="button"
			class="flex h-7 w-7 shrink-0 items-center justify-center rounded transition-colors {listening ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}"
			onclick={toggleVoice}
			title={listening ? 'Stop voice input' : 'Voice input'}
		>
			{#if listening}
				<span class="relative flex h-4 w-4 items-center justify-center">
					<span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-50"></span>
					<Icon name="mic" size={14} />
				</span>
			{:else}
				<Icon name="mic" size={14} />
			{/if}
		</button>
	{/if}
</div>
