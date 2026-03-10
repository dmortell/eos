
* Photo surveys: I need a mobile web app to take photos during site surveys, enter titles (via keyboard or voice), and generate an album that can be shared with the client. useful additional features would include:
   - geo-tagging & timestamps
   - mark photo location and direction on floorplans
   - upload and scale floorplans
   - annotations/markup
   - cloud sync, google photos or apple photos
   - project oragnization - album name and date
   - scan text labels for entry into descriptions/title
   - ability to read barcodes for tracking devices

## Suggested Tech Stack

   -  Svelte PWA
   -  Camera API
   -  Web Speech API
   -  ZXing barcode scanner
   -  Canvas annotations
   -  Firebase storage

a 360 degree viewer would be awesome. take a 360 panaroma ot various locations for client to walkthru.

# build your own (this may actually suit you)

Since you’re already a strong JS developer (CAD app, Svelte, etc) this is quite doable.

## Architecture:

* Mobile PWA (Svelte)

Capture photo:
   - navigator.mediaDevices.getUserMedia
Metadata:
   - GPS (navigator.geolocation)
   - timestamp
   - device orientation
Voice title
   - Web Speech API
Barcode
   - ZXing JS
   - QuaggaJS
Annotation
   - Canvas overlay
Floorplan pin
   - Upload plan
   - tap location
   - store coordinates


Metadata captured becomes the photo album title and report header:
   - project
   - site
   - surveyor
   - date
   - floor

No concerns with cable length limits.
Preference is for Hub 1 and Hub 3.
Swapping Hub 1 with AHU room would be preferred if possible.
If theres any possibility of expanding to the upper or lower floor in future, the rooms should be aligned with the internal vertical risers. So

## Data structure

project
  └ site
      └ photo
           - image
           - GPS
           - direction
           - plan_position
           - notes
           - barcode

Storage
   - Firebase / Supabase
   - Google Photos API

Report generation
   - PDF
      - photo
      - title
      - GPS link
      - timestamp

5️⃣ One killer feature you may want

* Photo direction arrow
   Record:
      - compass heading
      - phone pitch
   Then show on plan:
      - photo position + arrow

This makes surveys MUCH easier to review later.

## Upload:

   -  PDF floorplans
   -  rack layouts
   -  riser diagrams

The survey tool converts them to image layers.

Workflow:
open project
→ select floor
→ show plan
→ take photo
→ tap location on plan

This solves the “where was this photo taken?” problem.

## Photo Capture Process

Every photo should follow the same structure. Generally we take photos of walls, floors, ceilings, furniture to show clients the installation status & progress. Sometimes need to take photos of equipment for documenting installations or disposals.

Step 1 – Scan Device Barcode (if present)

   Scan:
      - rack ID
      - asset tag
      - ONU serial
      - switch barcode

   Result: automatically tags photos
      device_id: RACK-7

Step 2 – Take Photo

   When photo is taken automatically record:

      Metadata:
         - timestamp
         - GPS
         - compass direction
         - floor
         - device_id
         - surveyor

   Direction is important.
   Example:

         - photo: rack7-front.jpg
         - heading: 245°

   Later you can use this to display arrow direction on plan.

Step 3 – Voice Title

Instead of typing, say:
   "Rack 7 front showing Arista switch and patch panels"
Speech-to-text generates title.

Example metadata: title: Rack 7 front showing Arista switch


## Automatic Photo Naming

Never rely on manual naming. Use structured names. This makes sorting trivial.:
   SITE-FLOOR-SEQ-TITLE

Example: OTM-10F-023-RACK7-FRONT.jpg
Where:
   - OTM = site code
   - 10F = floor
   - 023 = sequential

## Mark Location on Floorplan

After taking photo, tap on plan.
Store:
   - x
   - y
   - heading
   - photo_id

Example record:
   -  photo_023
   -  plan_x: 342
   -  plan_y: 188
   -  direction: 245°

Display: dot + arrow

Quick Annotation

## Sometimes you need arrows or notes.

Example markup:
   ← fiber route
   ↑ install tray here
   ⚠ blocked conduit

Basic tools:
   - arrow
   - rectangle
   - text
   - highlight

## Capture Overview Photos

Always take these first:
   Entrance
      building exterior
      floor lobby
      IDF room door
   Room overview
      left wall
      right wall
      center
      ceiling
      floor
   Racks - For each rack:
      front
      rear
      top cable entry
      bottom cable entry
      label
   Pathways
      tray routes
      conduits
      penetrations
      shafts

This ensures nothing is missed.

## Automatic Timeline

Photos are automatically ordered:
   10:02 lobby
   10:05 IDF door
   10:07 rack row A
   10:12 rack row B

This becomes the survey narrative.

## Generate Report

Export automatically to PDF, or a web link to an album

Structure:
   - Project
   - Site
   - Date
   - Surveyor
   - Floor 10
   - [plan with photo markers]
      - Photo 023
      - Rack 7 front showing Arista switch
      - timestamp
      - GPS
      - image

## Cloud Sync

Immediately upload to prevent data loss:
   Google Photos
   iCloud
   or project cloud


## Killer Feature (Most Apps Miss):

Photo Direction Overlay
Store compass heading.
When a photo is selected, display on plan:
   dot = camera position
   arrow = viewing direction

## Data Structure

Project
  id
  name
  client
  site

Survey
  id
  date
  floors[]

Photo
  id
  file
  title
  timestamp
  gps
  heading
  barcode
  plan_x
  plan_y
  annotations[]

## Workflow

Workflow should not take more than 5 seconds per photo:
   scan rack
   tap photo
   voice note
   tap plan
   next

## Tech Stack

   -  Svelte PWA
   -  Camera API
   -  Web Speech API
   -  ZXing barcode scanner
   -  Canvas annotations
   -  Firebase storage

Works on: iPhone Android laptop
No App Store needed.

## Datacenter docmentation

Stand back and take rack with neighbors in row. Include ceiling trays and rack numbers (wide shot). Title: Rack 07 in row A
straight photo of Rack front full height. primary doc
rack rear full height
top cable entry, looking down, capture cable trays, ladder rack, cbale entry, bundles. for understanding routing congestion
bottom cable entry for floor cutouts, brush plates, conduits, power feeds
device and panel close ups:
   - switch front
   - switch rear
   - patch panels
   - firewalls
   - routers
   - PDUs
cable paths
close ups of asset tag, switch labels, panel & port labels

record rack unit positions, like Arista 7050 U34-U36

Example For Rack 07:

001 row overview
002 rack07 front
003 rack07 rear
004 rack07 top entry
005 rack07 bottom entry
006 rack07 switch front
007 rack07 switch rear
008 rack07 patch panel

Use Rack Numbers in Every Title

Example Survey Album
   Row A overview
   Rack01 front
   Rack01 rear
   Rack01 top
   Rack01 bottom
   Rack01 switch

   Rack02 front
   Rack02 rear
   Rack02 top
   Rack02 bottom
   Rack02 firewall

Even Better: Barcode Rack Labels
Put QR labels on racks:
Workflow:
   - scan rack QR
   - take photos
   - auto tag photos

Great surveys capture three layers:

Room Level
   room overview
   rows
   cooling
   power
Rack Level
   rack front
   rack rear
   top
   bottom
Device Level
   switches
   patch panels
   labels
   PDUs


A nice feature is a rack template:
When you scan rack RACK-07 the app automatically prompts:
[ ] front
[ ] rear
[ ] top
[ ] bottom
[ ] devices