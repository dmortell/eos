// The one id generator. Ids are opaque: never prefix-encoded, never derived from names (ADR 0001).
import { nanoid } from 'nanoid'

export const newId = (): string => nanoid(12)
