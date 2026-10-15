# Several buildings — one project per building, grouped

User 2026-10-16: "I'm not keen on the large changes needed to add buildings to a project (the only things two buildings
would have in common is the project name). Keep buildings as separate projects and group them: an Add building command
creates a new project with a `masterId` linking all buildings to a document with the project name, used just to keep
them together in project lists. Open Project lists 'Project Name - Building Name'." This replaces the earlier
one-project-many-buildings plan (it touched floors, riser view, labels and sheets throughout).

Example — Project Tourney: building1 (12F, 30F, 33F with areas 3303 / 3307), building2 (10F), a third building
(3 floors coming), an office in Osaka.

## The model

- **Group doc** `projectGroups/{masterId}` = `{ name, ownerId, members, createdAt }`. It holds only the shared name (and
  who may see the group), nothing else.
- **Each building is an ordinary project** (`projects/{pid}`), as today, plus `masterId` and `buildingName`. Its
  floors, cad entities, sheets, releases, legacy tools and backups are all its own; nothing in cad's model changes.
- **Shown as** "Project Tourney – building1". A project with no `masterId` shows its own name as today.
- **Add building** (Projects page, and Project › Add building… in cad): makes a new project in the same group. It
  copies the settings that should match (below), creates the group doc on first use (the current project gets
  `masterId` and `buildingName`), and opens the new project's Floors….

## Issues found, and how to meet them

1. **Settings that should stay the same across buildings** (usages, cable types, label patterns, title-block template
   and logos, file-name pattern, client / company details, PDF font). Each project keeps its own copy:
   - **copied** on Add building;
   - **"Copy settings from…"** (another building of the group) brings one up to date.
   - The alternative, live sharing through the group doc, would make every settings read look in two places — not
     worth it for settings that rarely change.
2. **Who can see what.** Members are per project. Add building copies the members; the group doc keeps the union, so
   the list can show the group. A member of one building only sees that building, and the group name.
   - Firestore rules aren't in the repo: `projectGroups` needs a rule (read for members, write for the owner).
3. **The project name lives in two places.** Rename the group: the group doc, and every building's display follows
   (`name` is no longer typed per building; the building part is `buildingName`). Old links and backups keep working
   because ids don't change.
4. **Cabling between buildings** (backbone building1 IDF ↔ building2 IDF) can't be one link, since links live in one
   project. Each end becomes an **external link**: a port linked to "building2 · 10F IDF · FP1:1–12" (text, with
   cores and length typed), so schedules, the BOM and labels list it. A later "check both ends" could compare the
   two projects.
5. **Releases and drawing registers that span buildings.** A release belongs to one project; a package for "the
   whole job" would need sheets from several. For now: one release per building, issued together (same name /
   date). Later, if needed, a group-level transmittal listing the buildings' releases.
6. **Reports across buildings** (one BOM / outlet count for the job): read each building's project and add them
   up — a "Group report" on the Projects page, later. Each building's own reports are unchanged.
7. **Labels and server-room letters** never clash, because each building is its own project. A building code in
   labels is only needed if they're mixed outside cad (an option, later).
8. **Switching buildings** in cad: the title bar shows "Project Tourney – building1 ▾" and lists the group's other
   buildings, which open in place (no trip back to the Projects page). Ctrl+K / Open Project search the group.
9. **The legacy tools** (frames, racks, outlets, Pages) use the same `projects/{pid}`, so they see buildings as
   projects too. Their project pickers should show "Name – Building" the same way (one helper: `projectTitle(p)`).
10. **Deleting a building:** the project's normal soft delete; the group doc goes when its last building does.
    Moving a project into or out of a group: Projects page › Group with… / Ungroup.
11. **Tourney today is one project holding building1** (its floors are in cad), with building2's 10F only in the
    legacy `projects.floors` (the import dropped it). Migration:
    - group the project as "Project Tourney – building1";
    - Add building → "building2", importing its 10F from the legacy data. The legacy tools' docs for 10F stay under
      the old pid — the new project imports what cad needs.
    - Also drop the stray empty second `building` doc.
    - Run with the user's go-ahead, and reversible.
12. **The Osaka office** is just another building in the group; its own address is on its sheets.

## Phases

1. **Groups (S–M):**
   - `masterId` / `buildingName` / `projectGroups`.
   - `projectTitle(p)` everywhere a project is named: the Projects page, Open Project, the recent list, the title bar.
   - The Projects page list grouped.
   - Add building (copies settings and members), rename group, Group with… / Ungroup.
   - A Firestore rule for `projectGroups`.
2. **Tourney migration (S):** as item 11.
3. **In cad (S):** the title bar's building switcher; Copy settings from…; external links (item 4).
4. **Later:** group report, group transmittal, a building code in labels.

## Decisions for the user

1. **Title blocks:** should {PROJECT} print "Project Tourney" (the group) or "Project Tourney – building1"? Suggested:
   the group name in {PROJECT}, and a new {BUILDING} field.
2. **Settings:** copy-on-create plus "Copy settings from…" (suggested), or live-shared via the group?
3. **Members:** copied per building (suggested), or one member list for the whole group?
4. **Sheet numbers:** each building numbers its own (S001…), or prefixed by a building code?
