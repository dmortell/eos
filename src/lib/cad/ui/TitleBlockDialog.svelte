<!-- The project's TITLE BLOCK template in a dialog (UX11; decision "Title block properties in a dialog or a floating
     window?" → (a)): about 25 rows that change every sheet, so they no longer sit under one sheet's Properties. Sheets ›
     Title block…, or the button in a sheet's Properties. Every edit is one undo step on the settings record. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { TitleBlockTemplate } from '../domain/titleBlock'
	import { backdropClose } from './backdrop'
	import TitleBlockEditor from './TitleBlockEditor.svelte'

	let { project, onclose }: { project: CadProject; onclose: () => void } = $props()

	function setTemplate(t: TitleBlockTemplate) {
		const st = project.settings
		if (st) project.store.transact('Title block template', (tx) => tx.put({ ...st, titleBlock: t }))
	}
</script>

<div class="backdrop" role="presentation" use:backdropClose={onclose}>
	<div class="dlg" role="dialog" aria-label="Title block" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.key === 'Escape' && onclose()}>
		<div class="head"><b>Title block <span class="hint">— the project's, on every sheet</span></b><button class="x" title="Close (Esc)" onclick={onclose}>✕</button></div>
		<div class="body"><TitleBlockEditor template={project.settings?.titleBlock} onchange={setTemplate} files={{ db: project.db, pid: project.pid }} /></div>
	</div>
</div>

<style>
	.backdrop { position: fixed; inset: 0; z-index: 80; background: rgb(0 0 0 / 0.25); display: flex; align-items: flex-start; justify-content: center; padding-top: 5vh; }
	.dlg { width: min(30rem, 96vw); max-height: 88vh; display: flex; flex-direction: column; background: var(--cad-panel, white); color: var(--cad-text, #18181b); border: 1px solid var(--cad-line, #e4e4e7); border-radius: 8px; box-shadow: 0 8px 30px rgb(0 0 0 / 0.2); font-size: 12px; }
	.head { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--cad-line, #e4e4e7); }
	.hint { font-weight: 400; color: var(--cad-muted, #71717a); }
	.x { color: var(--cad-muted, #71717a); }
	.body { overflow: auto; padding: 8px 12px 12px; }
</style>
