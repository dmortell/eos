# Sheets

Sheets is a simplified version of the Drawings tool in src\routes\projects\[pid]\drawings

Drawings tries to show complex views and editors of the other tools available:
* Fillrate drawings of pipes and rectangular cable containment: src\routes\projects\[pid]\fillrate
* Outlets shows trunk routes, racks and outlets on PDF floorplans: src\routes\projects\[pid]\outlets
* Frames sets port labels on patch frame elevationss: src\routes\projects\[pid]\frames
* Patching is to specify patch cord lists on patch frame elevations: src\routes\projects\[pid]\patching
* Racks edits racks and patch frame elevations in rows of a server room or datacenter: src\routes\projects\[pid]\racks
* Risers edits vertical cable routes between server rooms and EPS risers in a building elevation: src\routes\projects\[pid]\risers

Sheets will simplify these as follows:
* Each sheet in a project will represent a sheet of paper (normally A3 paper), with a titleblock
* Each sheet can have viewports added. Each viewport will contain a view into one of the tools rendering
* Sample code for the basic sheets is available in folder src-sample\routes\projects\[pid]\drawings (however there are some bugs)
* Make basic copies of each of the tools in folders under the sheets folder. Tools will be added in this order:
  1. Outlets
  2. Racks
  3. Risers
* Each tool will render content into a viewport. Floating windows or sidebars will allow editing properties of the content and objects rendered in the viewport

On print preview, each sheet must render only the content of the paper page area of the sheet, such that it fits the page when printed to PDF or hardcopy.

## Implementation steps

1. Create a list of sheets that the user can select for editing. Allow new sheets to be added
2. On opening a sheet from the list, allow the user to insert viewports by dragging out a rectangle.
3. A sheet properties panel should allow user to enter details for the titlebar
4. A viewport properties panel allows user to enter details of the viewport, including the type and data source