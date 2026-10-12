<!-- A STATUS CHIP, the same in every table and in Properties: a cord's status (add / change / replace / remove /
     installed), a link’s kind and status, a sheet’s issue state, a filter (No panel yet …). Its own pale background and dark text, so
     it reads the same in the light and dark themes. With `onclick` it's a filter toggle (`off` = hidden rows). -->
<script lang="ts" module>
	const TONES: Record<string, [string, string]> = {
		add: ['#dcfce7', '#166534'], change: ['#fef9c3', '#854d0e'], remove: ['#fee2e2', '#991b1b'], replace: ['#f3e8ff', '#7e22ce'], installed: ['#e4e4e7', '#3f3f46'],
		run: ['#e0f2fe', '#075985'], tie: ['#f3e8ff', '#6b21a8'], backbone: ['#ffedd5', '#9a3412'],
		'not-issued': ['#fef9c3', '#854d0e'], issued: ['#dcfce7', '#166534'], changed: ['#ffedd5', '#9a3412'], superseded: ['#e4e4e7', '#52525b'],
		active: ['#dcfce7', '#166534'], archived: ['#e4e4e7', '#52525b'], design: ['#e0f2fe', '#075985'], warn: ['#fef3c7', '#92400e'], bad: ['#fee2e2', '#b91c1c'],
	}
	/** The tone's colors as an inline style (for a select styled as a chip, as Cord Properties' status box). */
	export const toneStyle = (tone: string): string => { const c = TONES[tone]; return c ? `background:${c[0]};color:${c[1]}` : '' }
</script>

<script lang="ts">
	let { tone, label, off = false, upper = true, title, onclick }: {
		tone: string; label: string
		/** A filter chip that's switched off (its rows hidden): faded. */
		off?: boolean
		/** Capitals (statuses, kinds); false for words such as "Issued C02". */
		upper?: boolean
		title?: string
		onclick?: () => void
	} = $props()
</script>

{#if onclick}
	<button type="button" class="chip" class:off class:upper style={toneStyle(tone)} aria-pressed={!off} {title} {onclick}>{label}</button>
{:else}
	<span class="chip" class:upper class:none={!toneStyle(tone)} style={toneStyle(tone)} {title}>{label}</span>
{/if}

<style>
	.chip { display: inline-block; font-size: 10px; font-weight: 600; line-height: 16px; border-radius: 3px; padding: 0 5px; border: 0; white-space: nowrap; }
	.upper { text-transform: uppercase; }
	button.chip { min-height: 20px; cursor: pointer; }
	.chip.off { opacity: 0.35; }
	.chip.none { color: var(--cad-faint); }
</style>
