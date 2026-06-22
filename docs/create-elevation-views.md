How section→elevation works now: the "⬚ Section → elevation" tool (Object window, on a plan viewport) drops the elevation viewport onto the same sheet as the plan. There's no "send to sheet X" option at creation time. But elevation viewports carry their clip, and the viewport clipboard survives sheet navigation, so you copy them across:

Steps
1. On the plan (sheet A), Object window ▸ ⬚ Section → elevation, drag a box over each room. Each creates an elevation viewport on sheet A ("Section 1", "Section 2"…).
2. Select each one and set its View (front/rear/left/right) + Scale in the Object window (the section props block) so it shows the wall you want.
3. Exit to the sheet level — double-click empty space / Escape until the status bar reads "Insert…" (not "Viewport active").
4. Click the elevation viewports to select them (Shift-click for several) and Ctrl+C (copy) — or Ctrl+X to move.
5. Open/create the new sheet and Ctrl+V. They paste in with their clips intact (the room crop travels with them); reposition to taste.