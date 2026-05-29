/**
 * Shared rack elevation rendering.
 *
 * `RackElevation` is the canonical rack/devices renderer used wherever a rack
 * elevation needs to be drawn — the Racks tool (interactive), the drawings
 * tool viewports (read-only), and the workspace canvas (read-only, with a
 * device-editor overlay added by later steps).
 *
 * The component itself currently lives next to the Racks tool's other parts
 * (`racks/parts/RackElevationRenderer.svelte`) because it shares helpers and
 * sub-components with the interactive tool. This module re-exports it from
 * `$lib/rack` to give external consumers a stable import path independent of
 * the Racks tool's internal file layout.
 *
 * Patching has its own port-centric rack rendering (`patching/parts/Elevation*`)
 * which is structurally different (port grids, not device columns) and is NOT
 * unified with this renderer for now.
 */
export { default as RackElevation } from '../../routes/projects/[pid]/racks/parts/RackElevationRenderer.svelte'
export {
	SCALE,
	RU_HEIGHT_MM,
	RACK_19IN_MM,
	RACK_GAP_PX,
	DEFAULT_SETTINGS,
	rackHeightMm,
} from '../../routes/projects/[pid]/racks/parts/constants'
export type {
	RackConfig,
	DeviceConfig,
	RackSettings,
	ViewState,
	ElevationFace,
} from '../../routes/projects/[pid]/racks/parts/types'
