import type { ToolType, ViewPreset } from '$lib/types/versioning'
import { racksAdapter } from './racks'
import { framesAdapter } from './frames'
import { outletsAdapter } from './outlets'

/** Which tools are scoped to floor+room vs just floor vs project */
export type ToolScope = 'floor-room' | 'floor' | 'project'

export interface ToolMeta {
  label: string
  scope: ToolScope
  presets: ViewPreset[]
}

const meta: Record<ToolType, ToolMeta> = {
  racks:    { label: 'Rack Elevations',   scope: 'floor-room', presets: racksAdapter.defaultViewPresets() },
  frames:   { label: 'Patch Frames',      scope: 'floor',      presets: framesAdapter.defaultViewPresets() },
  outlets:  { label: 'Outlets / Routes',   scope: 'floor',      presets: outletsAdapter.defaultViewPresets() },
  patching: { label: 'Patching',           scope: 'floor-room', presets: [{ name: 'Patch Schedule', layers: { default: true } }] },
  fillrate: { label: 'Fill Rates',         scope: 'project',    presets: [{ name: 'Fill Rate Diagram', layers: { default: true } }] },
  survey:   { label: 'Photo Surveys',      scope: 'project',    presets: [{ name: 'Survey Album', layers: { default: true } }] },
}

export function getToolMeta(toolType: ToolType): ToolMeta {
  return meta[toolType]
}

export function allToolMeta(): Record<ToolType, ToolMeta> {
  return meta
}

/** Build the Firestore source doc ID for a given tool/floor/room */
export function buildSourceDocId(pid: string, toolType: ToolType, floor?: number, room?: string): string {
  const fl = String(floor ?? 1).padStart(2, '0')
  switch (toolType) {
    case 'racks':
    case 'patching':
      return `${pid}_F${fl}_R${room ?? 'A'}`
    case 'frames':
    case 'outlets':
      return `${pid}_F${fl}`
    case 'fillrate':
      return pid
    case 'survey':
      return pid
  }
}

/** Parse floor/room from a source doc ID like "{pid}_F05_RA" */
export function parseSourceDocId(sourceDocId: string): { floor?: number; room?: string } {
  const floorMatch = sourceDocId.match(/_F(\d+)/)
  const roomMatch = sourceDocId.match(/_R([A-D])/)
  return {
    floor: floorMatch ? Number(floorMatch[1]) : undefined,
    room: roomMatch ? roomMatch[1] : undefined,
  }
}

/** Build a relative URL to open the tool for a drawing, with floor/room/view params */
export function drawingToolHref(pid: string, toolType: ToolType, sourceDocId: string, viewPreset?: ViewPreset): string {
  const base = `/projects/${pid}`
  const toolPath: Record<ToolType, string> = {
    racks: 'racks', frames: 'frames', outlets: 'outlets',
    patching: 'patching', fillrate: 'fillrate', survey: '',
  }
  const path = toolPath[toolType]
  if (!path) return base

  const params = new URLSearchParams()
  const { floor, room } = parseSourceDocId(sourceDocId)
  if (floor != null) params.set('floor', String(floor))
  if (room) params.set('room', room)

  // Encode view preset layers as params (e.g. lowOutlets=1&highTrunks=0)
  if (viewPreset?.layers) {
    for (const [key, val] of Object.entries(viewPreset.layers)) {
      params.set(key, val ? '1' : '0')
    }
  }

  const qs = params.toString()
  return `${base}/${path}${qs ? `?${qs}` : ''}`
}

/** Generate a default title for a drawing */
export function defaultDrawingTitle(toolType: ToolType, presetName: string, floor?: number, room?: string): string {
  const flStr = floor ? `${floor}F` : ''
  const rmStr = room ? ` Room ${room}` : ''
  const scope = flStr + rmStr
  return scope ? `${presetName} ${scope}` : presetName
}
