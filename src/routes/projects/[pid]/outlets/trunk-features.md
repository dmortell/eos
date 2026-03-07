
Trunks define the routes that cables can be laid.

Trunks can be circular pipes or rectangular trays. specify width and height

Common pipe types are: PF22, PF28, E51 where PF indicates plastic flexible and the number indicates inner diameter in mm (outer diameter is generally 8mm more than inner diameter for the flexible corrugation), and E is steel Aluminum-Zinc Alloy Plated and the number indicates the outer diameter in mm.

Rectangular trunks can range from rubber matting, ladders or trays, steel containers, and MK duct.
MK duct comes in various sizes (width x height in mm):
No.0 (MD02) 40x20
No.1 (MD12L10) 40x20
No.2 (MD23L10) 40x20
No.3 (MD32L10) 80x60
No.4 (MD45L10) 100x80
No.5 (MD51L10) 150x100



trunks can be under raised floor or in ceiling plenum, or trays hanging from ceiling slab or ceiling framework.
trunks can run horizontally, or vertically up walls. trunks may slope up or down to avoid building beams or a/c ducts.

internally, trunks are composed of line segments (edges) connected at nodes. 2 or more edges can connect to a node.

## Rendering lines for trunks

user sets width/height for the trunk, along with type.

rectanglular trunks are drawn as rectangles
pipes are drawn as rectangles from above or the side, or as ellipses when viewed head on.
at nodes where multiple edges meet, trunks must be drawn with rounded mitered corners, with specifiable radius. ideally a draggable handle will be shown when the trunk is selected, that allows the radius to be adjusted.

trunks of different dimensions and types may be connected together.
trunks of the same type/size can be stores as an array of points {x,y,z}



## Drawing lines for trunks - interface

before drawing, user can set the z-coord, type, width height of the trunk to be drawn.

User draws trunks by plotting lines on the floorplan.
Some users prefer click-click to set points, and dbl-click or escape to end.
Some users rather drag from start to end of the line segment. both should be supported.

In drawing mode, dragging from an existing point should start a new new segment connected to the point.

In select mode, draging moves the point or edge.

ctrl-drag a point to add a new segment from that point
ctrl-drag an edge to split the edge in two and start drawing a new segment from that point. ctrl-click an edge to split the edge and create a node at that point.

NOTE: This means ctrl-drag to copy lines will not work - is there a way to allow both? maybe allow ctrl-copy in select mode.

Holding shift while dragging or drawing, constrains the segment to angles of 15 degrees.

dblclick an edge to add a label. the label can be dragged, the position is relative to the first node of the segment (or nearest node?)

Dragging a point or edge must update the connection points of any other edges connected to it.

Points can be connected to shapes like racks or outlets.
If shapes are moved, all connected points must be moved with it.

Click a node to select it. press delete to delete it.

when a point is selected, user should be able to edit the z-coordinate.
Floating windows with Viewports with front/back/left/right side elevations would be awesome for viewing and editing vertical trunks.



## Secondary trunks

The user draws primary trunks.

Secondary trunks are drawn automatically from outlets to the designated or nearest patch frame. The shortest route is calculated from outlet to the nearest trunk then to the rack.

inv2026-04

## sample files

Code for drawing walls with mitered corners, may need modification for rounded joints:
src\routes\projects\[pid]\outlets\sample-routing\route-rendering\Walls4.svelte

This CAD app has good code for drawing lines similar to the requirements above:
F:\Dev\web\inv2025-cad\src\routes\cad\CadView.svelte
