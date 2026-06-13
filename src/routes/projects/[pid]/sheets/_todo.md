
1. Package sheets into drawing sets  ✅ DONE
   Sheets/Packages toggle on the list; PackageManager with two-list membership (add/remove/reorder by
   buttons or drag); per-package Print → /sheets/packages/[pkgId]/print renders every sheet one per
   page. Data: projects/{pid}/sheetPackages. (Page number in titleblock still TODO if wanted.)
See the packages tool (src\routes\projects\[pid]\packages) and drawings tool (src\routes\projects\[pid]\drawings)

A toggle button in our sheets list view switches to package manager which lets use add/edit a list of packages/drawing sets.
A print button on each item in the list opens a print preview with all sheets in the package, one per paper page, that can be printed to PDF or hardcopy. (we might want the page number in the titleblock at a later date).
On selecting a package, show 2 lists, one with sheets in the package and one with remaining sheets. Let the user select drawings in one list and drag them (or use buttons) to move them to the other list.
Allow user to reorder sheets in the list.

Try to reuse the existing sheet list code.

2. Renumber sheets
A renumber tool (maybe a menuitem in a ... button to the right of the New Sheet button) that lets renumber selected or clicked sheets in the list in order continuing from the previous or first selected sheet.
Preserve any prefix text the user may have entered in the label.

3. Revisions
Like our exiting tools, our sheets/packages will need to track published packages and revisions.
The sheets list should show the latest version by default, but maybe a dropdown arrow in the actions column to select an old version for viewing or allow reverting it to be the latest version for further updates.

