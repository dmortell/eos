// /cad/agent — the cad guide for an AI assistant driving cad in a browser (src/lib/cad/ui/agentGuide.ts). Plain text,
// outside the app's sign-in screen, so an LLM can read it with a fetch or by opening it in a tab.
import { agentGuide } from '$lib/cad/ui/agentGuide'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = () =>
	new Response(agentGuide(), { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=300' } })
