Current state:
- Annotations and model3d already have per-object layers (annotations use the sheet LAYERS; model3d uses its own per-model layers).
- Outlets, trunks, rooms, ladders, cables, racks, devices have no per-object layer — each is hard-mapped to its kind's default layer, and hide/lock is whole-group by kind.

add layerId to those 7 object types, a layer <select> in each property editor (mirroring AnnotationControls), per-object hide/lock honoring in each render, a setSelLayer method per tool editor, and layer-on-create. Two design choices materially shape it — let me confirm them before building across all three tools.

· Which layers should an object be assignable to in its property editor? → Any layer
· When an object is moved to a custom layer, should it take that layer's color? → Adopt the layer color

Got it — any layer, and adopt the layer's color on custom layers. That's the more capable version. This is a large, cross-cutting change (7 object types × types/editor/panel/render/creation), so I'll build a shared helper, implement outlets fully as the template, verify it, then replicate to risers and racks. Let me set up tasks and read the reference patterns.

