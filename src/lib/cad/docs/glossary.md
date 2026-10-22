# Glossary

These are the cad tool's terms. Use them in code, UI and docs. The "Was" column shows what each one was called in
the old tools, so importers and conversations can map between them.

## Places

| Term | Meaning | Was |
|---|---|---|
| **Building** | A building in the project; levels stack in it. | Implied by riser ranges / `FloorConfig.building`; a Pages place |
| **Level** | One storey: its floor number, FFL elevation, and slab / raised-floor / ceiling / plenum heights. | Floor (`FloorConfig`), riser floor heights, Pages storeys / levels |
| **FFL** | Finished floor level, the top of the raised floor. Every z in a level is measured from it. | "FL±0" in Pages; the slab in Outlets trunks (z = 0 at slab) |
| **Space** | Any named area on a level: tenant area, zone, room, server room, EPS. Generic; `kind` is only for display. Its `code` is the label token it contributes. | Tenant area (`FloorArea`), Frames zone letter, room number, server room A–D, riser room, Pages zone / room place |
| **Area plan** | A separate plan of part of a floor (a tenant area, a zone of an office): a Level with `area` set, its own floorplans and model, shown under its floor (e.g. 33F 3303, 33F 3307). Not a Space. | Tenant area plans, the `{pid}_F33__3307` Outlets docs, Pages zone models |
| **Floorplan** | A PDF page (or image) placed under a plan: an Underlay with origin / scale / crop. A plan's extra ones are "Floorplan 2…" (no longer "Zone n"). | Outlets selected file / page, Uploads page |
| **Zone** | A Space whose `code` is the Z token of outlet labels — an outlet's "zone". Not an area plan. | Frames zone letter |
| **Server room** | A Space that holds racks; its `code` is the S token. | Server room A–D, IDF |

## Cabling

| Term | Meaning | Was |
|---|---|---|
| **Outlet** | A cabling point with 1..n ports: its label, tier, usage, mount and (once drawn) position. One record. | Frames **location** + Outlets **outlet** (linked by `locationId`), a Pages block insert |
| **Port** | One socket on an outlet or device, addressed `{on, port, face?}` (a `PortRef`). Not an entity of its own. | Frames port, `PortRef`, `deviceId:portIndex` |
| **Core** | One fiber thread. A fiber **port** is a pair of cores (an LC duplex); ports are numbered, cores are not (User 2026-10-22). | fiber port, strand |
| **Tier** | `low` (floor level) or `high` (ceiling level). Drives the H token and which panels serve the outlet. | Level low/high, `isHighLevel`, `patchLevel`, "-H" |
| **Usage** | What the outlet is for (desk, AP, printer, TV …), from a per-project list. | `LocType`, `OutletUsage` (two lists, now one) |
| **Label** | The text printed for an outlet, a port or any shape. Plain text, stored once: a panel port shows the label of the outlet port it is linked to (ADR 0002). |
| **Renumber** | Rewrite one number in a set of labels, in pick, reading or label order, keeping prefix and padding. An outlet's port labels follow (ADR 0002). | Pages walk renumber / auto-number | Port label, baked label, `portLabels`, `attrs.LABEL` |
| **Rack** | A frame or cabinet in a space, with U height and footprint. Front = local +y face. | `RackConfig`, Pages rack prism, "frame" (Frames tool) |
| **Rack row** | A row of racks sharing defaults and containment. | `RackRow` |
| **Device** | Anything mounted in a rack at a U position: patch panel, switch, shelf, PDU … | `DeviceConfig`, Pages device prism |
| **Panel** | A device of kind `panel`. It has a tier, a server room, reservations and (once printed) frozen labels. | Patch panel, `PanelDevice`, `FrameConfig` panel range |
| **Link** | A permanent cable between a panel's rear port and an outlet port (horizontal), or between panels (tie / backbone). Allocation *is* the set of links. | `StructuredLink`, `portAssignments`, `bakedLabels`, Pages `device.alloc` |
| **Cord** | A patch cord between two device ports, with an install status (add / remove / change / installed). | `PatchConnection` |
| **Reservation** | Panel ports held for a usage before allocation. | `PortReservation` (block assign) |
| **Containment** | Trunking, conduit, tray, ladder or riser: a path **Shape** with the containment role. Horizontal and vertical segments are the same thing. | `TrunkConfig`, riser ladder, Pages conduit |
| **Route** | The containment segments a link runs through. | `RouteConfig`, secondary routes |

## Shapes and 3D

| Term | Meaning | Was |
|---|---|---|
| **Shape** | Anything drawn, anywhere: a **path** (nodes with x / y / z, segments), a **region** (rect / circle / polygon on a plane), an arc, text, a dimension, a leader, a cloud, an image or a block insert. 2D is simply a shape with no section or extent (ADR 0007). | Pages `Ent` (2D) and `Obj` (3D), two separate worlds, plus annotations |
| **Section** | A path's cross-section, w × h (rectangular or round). A line with a section is a 3D strip. | Wall thickness / height, conduit w / h / edges |
| **Extent** | How far a region is pushed out of its plane: up from a plan, away from the viewer on an elevation. | Box height, prism `h` |
| **Role** | What a shape *is* beyond its geometry: wall (hosts openings), containment (carries cables), object (furniture / equipment). Set it to convert a line; clear it to convert back. | Separate entity types per tool |
| **Vertical segment** | A path segment whose two nodes share x / y: a drop, a rise, or a riser when the nodes are on different levels. | Conduit drop, riser ladder |
| **Work plane** | Where clicks land in a view: **work Z** in a plan, **work depth** in an elevation, both set in the tool bar. In a split view each pane shows the other's work plane (ADR 0006). | Pages depth plane / guide lines |
| **Split view** | Two panes side by side, each switchable to Plan / Front / Rear / Left / Right. | Pages split tabs |

## Drawings

| Term | Meaning | Was |
|---|---|---|
| **View** | A stored *recipe* for a drawing: a plan of a level, an elevation along a frame, a rack front, a riser, a schedule. Its content is generated. | Pages model tab / frame direction, Sheets viewport source |
| **Sheet** | Paper with a title block, viewports and paper-owned shapes. Also listed in the drawing register. | Pages sheet, Sheets sheet, Drawings page |
| **Viewport** | A rectangle on a sheet showing one view at a true scale 1:N. | Pages frame, Sheets viewport |
| **Owner** | Who a shape belongs to: a level's model, one view, or a sheet's paper. Deleting the owner deletes its shapes. | Pages `space: 'model' \| 'view:<id>'` |
| **Override** | A per-viewport tweak to generated content (hide an item, nudge a label). | (none) |
| **Group** | Shapes that select and move together; groups nest. | Pages `groupId` |
| **Block** | A named list of ordinary shapes, placed by an *insert* shape: **linked** (follows edits to the definition) or **copied** (dropped in as an editable group). Global or per project. Outlet graphics are blocks. | Pages block, Sheets symbol, "named shape groups" (Pages HIGH todo) |
| **Penetration** | A core drill through a wall or slab: a shape with the penetration role, auto-detected where containment crosses a wall / slab, or placed by hand (PEN). | Pages PEN block |
| **Display list** | A generator's output: lines, polygons, text, symbols and images in drawing mm, each tagged with its source entity. Drawn to screen, print and DXF. | (none; each tool rendered its own way) |
| **Operation (op)** | One change to one entity, `{type, id, before, after}`. An edit is a transaction of ops; undo applies their inverses. | (none; Pages snapshotted everything) |
