<!-- What everyone ELSE in the project sees of a restore (ADR 0008 §6): the countdown before it starts, "editing is
     paused" while it runs, and who restored what when it's done (until dismissed). The person restoring follows it
     in their own Restore dialog. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import { isLive, ABANDONED_MS } from '../app/restoreNotice.svelte'

	let { project }: { project: CadProject } = $props()

	let now = $state(Date.now()), dismissed = $state<string[]>([])
	$effect(() => { const t = setInterval(() => (now = Date.now()), 500); return () => clearInterval(t) })

	const n = $derived(project.notices.notice)
	const show = $derived(!!n && !project.notices.mine(n) && !dismissed.includes(`${n.id}:${n.state}`) &&
		(isLive(n, now) || ((n.state === 'done' || (n.state === 'cancelled' && project.notices.sawComing(n.id))) && now - n.at < ABANDONED_MS)))
	const left = $derived(n ? Math.max(0, Math.ceil((n.startsAt - now) / 1000)) : 0)
	const who = $derived(n?.by.name || 'Someone')
	const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
</script>

{#if show && n}
	<div class="rn rn-{n.state}" role="alert">
		{#if n.state === 'pending'}
			<b>{who} will restore {n.parts} from “{n.what}” in {left} s.</b>
			<span>Changes you make there until then will be lost.</span>
		{:else if n.state === 'running'}
			<b>{who} is restoring {n.parts} from “{n.what}”.</b>
			<span>Editing is paused until it's done.</span>
		{:else if n.state === 'done'}
			<b>{n.parts} was restored from “{n.what}” by {who} at {time(n.at)}.</b>
			{#if n.summary}<span>{n.summary}. Your undo history was cleared.</span>{/if}
		{:else}
			<b>{who} did not restore {n.parts}{n.summary ? ` (${n.summary})` : ''}.</b>
		{/if}
		{#if n.state === 'done' || n.state === 'cancelled'}<button onclick={() => (dismissed = [...dismissed, `${n.id}:${n.state}`])}>Dismiss</button>{/if}
	</div>
{/if}

<style>
	.rn { position: fixed; top: 64px; left: 50%; transform: translateX(-50%); z-index: 92; max-width: min(40rem, 92vw); display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; padding: 8px 14px; border-radius: 8px; font-size: 12px; box-shadow: 0 8px 30px rgb(0 0 0 / 0.25); border: 1px solid; }
	.rn-pending, .rn-running { background: #fffbeb; border-color: #f59e0b; color: #78350f; }
	.rn-done { background: var(--cad-feature, #eff6ff); border-color: var(--cad-link, #2563eb); color: var(--cad-sel-text, #1e3a8a); }
	.rn-cancelled { background: var(--cad-panel, white); border-color: var(--cad-line, #e4e4e7); color: var(--cad-text, #18181b); }
	.rn button { margin-left: auto; border: 1px solid currentColor; border-radius: 4px; padding: 0 8px; background: none; color: inherit; }
</style>
