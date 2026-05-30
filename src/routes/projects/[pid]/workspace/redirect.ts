/**
 * Helpers for redirecting old tool routes to the workspace.
 *
 * Each old route (`/racks`, `/frames`, `/patching`, `/outlets`, `/risers`)
 * delegates here so the URL-encoding stays consistent with what the
 * workspace itself reads (see `+page.svelte`'s URL → state effect).
 *
 * The fallback `?legacy=1` query keeps the old route reachable without
 * deleting the page — a strangler-fig escape hatch during the transition.
 */

export interface RedirectInput {
	pid: string
	floor?: string | null
	room?: string | null
	frame?: string | null
}

export function buildWorkspaceUrl(opts: {
	pid: string
	node: string
	kind: string
	view?: string
}): string {
	const sp = new URLSearchParams()
	sp.set('node', opts.node)
	sp.set('kind', opts.kind)
	if (opts.view) sp.set('view', opts.view)
	return `/projects/${opts.pid}/workspace?${sp.toString()}`
}

export function racksRedirect(input: RedirectInput): string {
	const floor = Number(input.floor) || 1
	const room = input.room ?? 'A'
	return buildWorkspaceUrl({
		pid: input.pid,
		node: `floor:${floor}/sr:${room}`,
		kind: 'serverRoom',
		view: 'room-elevation',
	})
}

export function framesRedirect(input: RedirectInput): string {
	const floor = Number(input.floor) || 1
	// If a specific frame (= rack) was passed, deep-link into the Frames view
	// pre-selecting that rack via the workspace's initialFrameId derivation.
	if (input.frame) {
		return buildWorkspaceUrl({
			pid: input.pid,
			node: `floor:${floor}/frames`,
			kind: 'frames',
			view: 'frames',
		})
	}
	return buildWorkspaceUrl({
		pid: input.pid,
		node: `floor:${floor}/frames`,
		kind: 'frames',
		view: 'frames',
	})
}

export function patchingRedirect(input: RedirectInput): string {
	const floor = Number(input.floor) || 1
	const room = input.room ?? 'A'
	// Patching view in the workspace is rack-centric; the closest landing
	// without picking a specific rack is the room elevation. From there the
	// user clicks a rack to switch to the Patching view.
	return buildWorkspaceUrl({
		pid: input.pid,
		node: `floor:${floor}/sr:${room}`,
		kind: 'serverRoom',
		view: 'room-elevation',
	})
}

export function outletsRedirect(input: RedirectInput): string {
	const floor = Number(input.floor) || 1
	return buildWorkspaceUrl({
		pid: input.pid,
		node: `floor:${floor}`,
		kind: 'floor',
		view: 'outlets-high',
	})
}

export function risersRedirect(input: RedirectInput): string {
	return buildWorkspaceUrl({
		pid: input.pid,
		node: 'building/risers',
		kind: 'risers',
		view: 'risers',
	})
}
