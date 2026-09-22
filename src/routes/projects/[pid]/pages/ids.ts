import { nanoid } from 'nanoid'

// ONE id generator for the whole Pages tool (B13). The `prefix` keeps ids human-scannable in the store
// (e = entity, n = node, s = segment, g = guide, w = wall, t = trunk, ly = layer …); nanoid gives the
// collision resistance the old `Date.now().toString(36) + seq++` counters lacked — those seq counters were
// per-module (and `uid`/`mUid` were per-Viewport-INSTANCE), so two frames of the same model in split view
// could mint the same id within one millisecond. Firestore-stable (opaque string ids).
export const newId = (prefix = 'x'): string => prefix + nanoid(8)
