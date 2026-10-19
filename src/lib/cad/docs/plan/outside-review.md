# Outside review and markup — investigation (2026-10-20)

The User's todo of 2026-10-17: let other vendors and the client review our drawings, check them back and mark them up
(comments, clouds, "OK / revise" per sheet) without editing the model. The User asked for an investigation first (no
code). Recommendation at the end; questions for the User marked ❓.

## What cad has today

- **A release** (`app/issue.ts`) freezes each sheet at its revision in `projects/{pid}/cadIssued` (written once,
  never edited) and uploads ONE package PDF to the project's file storage (UploadThing or Firebase Storage), recorded
  on the Issue with a token download URL. The PDF opens with Download / Print / Email / share….
- **The design log** (`DesignChange`): numbered changes with what / why / asked by / reference / status (open, done,
  rejected, superseded), linked to items and sheets, released on a sheet at a revision. Clouds mark a change on a sheet
  (its number in the triangle). design-log.md step 5 already says: "with outside review: a reviewer's markups arrive
  as changes asked by them".
- **Access**: Firestore and Storage rules allow only the team's addresses (`*@eiresystems.com` and the owner), set
  in the Firebase console (not in the repo). There is no per-project membership in the rules — "Members" only filters
  the project list. Sign-in is Google / GitHub / Microsoft OAuth; Email / password must stay off (the rules trust the
  address).
- **Reading PDFs**: pdfjs-dist is already used (Uploads, floorplans). `page.getAnnotations()` returns a PDF's markup
  annotations: Text (sticky notes), FreeText, Square / Circle, Polygon / PolyLine (Acrobat and Bluebeam clouds are
  polygons with a cloud border effect), Ink, Line, Stamp, Highlight — each with its rectangle / points, contents, color,
  author (`titleObj`) and date.

## Three ways

### A. PDF round trip (no accounts)
The reviewer gets the released PDF (the link we already send), marks it up in what they already use (Acrobat Reader,
Bluebeam, Edge, Preview — all free to annotate), and sends the marked PDF back. Someone on the team drops it on the
release: **Release › Import review…**.
- cad reads the annotations page by page; each page is a known sheet at a known revision (the release made the PDF, so
  page n ↔ sheet n, and the frozen copy gives its paper size).
- The marks show on that sheet as a **review overlay**: on paper, at their place, drawn in the reviewer's color, on a
  layer per reviewer (hide / show, "Review — Client (2026-10-21)"). They are not model items; nothing is edited.
- Each comment becomes a **change in the Log**: what = its text, asked by = its author (or the name typed at import),
  ref = "Review of Release 3 (file name)", linked to the sheet, status open. A stamp / a comment "OK" can set a per-sheet
  verdict (OK / revise) on the release's row.
- Seeing them against the next revision: the overlay belongs to (sheet, revision); opening the sheet at its next
  revision can show the previous review's marks faded, with each linked change's status beside it.
- Cost: an import (pdf.js annotations → overlay records + changes), an overlay renderer on sheets, a verdict field.
  **M**. No rules change, no new sign-in, works for any vendor today.
- Limits: a reviewer who prints, scribbles and scans gives us an image, not annotations (it can still be attached as an
  overlay picture, without changes). Annotation geometry is in PDF points — the page's mm scale is exact because cad
  drew the page.

### B. Guest accounts (review inside cad)
A reviewer signs in (Google / Microsoft) and sees only one project's released sheets, with a markup tool (clouds,
comments, a verdict) writing to a `reviews` collection.
- Needs Firestore rules per project: a `reviewers` list on the project (emails), rules letting a listed reviewer READ
  that project's `cadIssued` and the release records, and WRITE only `projects/{pid}/reviews/*` with their own uid. The
  Storage rules would need the same, or the PDF / floorplans keep using token URLs (which bypass rules — so anyone with
  a URL can read it, as today).
- The rules move from the console into the repo (`firestore.rules`) so they are reviewed — the repo is public, so
  they must be right: today's rules are the only thing protecting the data.
- A read-only "review" page (a sheet from its frozen copy, no editing UI, no model), its own route.
- Notifications: an email when a release goes out / a review comes back (a Cloud Function or a mail service — there
  is no server code now; Vercel functions could do it).
- Cost: **L**. Security work first; every guest is a new risk on a public repo.

### C. Shared review link (no sign-in)
A secret link per release (a long random token) opens a read-only review page; marks are written through a server
function that checks the token. Needs server code (a Vercel function with Firebase Admin) and token expiry / revoke.
Simpler for the reviewer than B, but a forwarded link is a forwarded review right. **L**.

## Recommendation

Build **A** first. It needs no new access rules and no sign-in, and it works with the tools reviewers already use.
Their marks come back as Log changes, which the design log already numbers, clouds and releases. B or C can come
later if reviewers ask to review online. A's overlay and changes would be reused there, with only the way marks come
in being different.

## ❓ For the User
1. Who imports — anyone on the team, or the project owner only?
2. A reviewer's comment → always a Log change, or an "inbox" of marks to accept into the Log one by one (some marks are
   just "OK" or questions)?
3. Verdict per sheet (OK / revise / rejected), per release, or both?
4. Should the overlay print (a PDF of "our sheet with their marks"), or stay on screen only?
5. Later B: are reviewers ever outside companies we trust with a sign-in, or always "send them a PDF"?
