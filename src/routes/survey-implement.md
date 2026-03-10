
# Site Survey Photo App – Implementation Plan

## Goal
Build a lightweight **mobile-first PWA** for capturing structured site-survey photos during IT / telecom / facilities inspections.

The system must allow fast capture of photos with metadata, location on floorplans, voice titles, barcode tagging, and exportable reports.

Target users: engineers performing **datacenter / comms room / infrastructure surveys**.

---

# 1. Core Requirements

## Primary Features
1. Capture photos with device camera
2. Voice-to-text titles
3. Barcode/QR scanning for rack or asset ID
4. GPS location + timestamp
5. Compass heading (photo direction)
6. Floorplan mapping (tap location)
7. Photo annotation/markup
8. Project & survey organization
9. Cloud sync
10. Export PDF report

## Performance Targets

| Metric | Target |
|---|---|
Photo capture time | <2 seconds |
Metadata capture | automatic |
Offline capability | full |
Photos per survey | 200–500 |
Platforms | iOS / Android / Desktop |

---

# 2. Technology Stack

## Frontend
Framework:
- **Svelte 5 (PWA)**

Libraries:
- Camera: browser MediaDevices API
- Barcode scanning: ZXing JS
- Speech recognition: Web Speech API
- Drawing/annotation: Canvas API
- State management: Svelte stores

UI:
- Tailwind CSS
- mobile-first layout

---

## Backend

Option A (simplest):

Firebase
- Firestore (metadata)
- Cloud Storage (images)
- Authentication
- Hosting

Option B:

Supabase
- Postgres
- Storage
- Realtime sync

---

## Device APIs

| Feature | API |
|---|---|
Camera | navigator.mediaDevices.getUserMedia |
GPS | navigator.geolocation |
Compass | DeviceOrientationEvent |
Voice input | Web Speech API |
Barcode scanning | ZXing |
File storage | IndexedDB |

---

# 3. Data Model

## Project

Project
id
client
site
address
created_at


## Survey


Survey
id
project_id
date
surveyor
floors[]


## Floor


Floor
id
survey_id
name
plan_image
scale


## Photo


Photo
id
survey_id
floor_id
image_url
title
timestamp
gps_lat
gps_lng
heading
barcode
plan_x
plan_y


## Annotation


Annotation
id
photo_id
type
geometry
text


---

# 4. User Workflow

## Step 1 – Create Project

User inputs:

- client name
- site name
- address

Result:


Project created


---

## Step 2 – Start Survey

User selects:


Project → New Survey


Metadata stored:


date
surveyor
floor list


---

## Step 3 – Upload Floorplans

User uploads:

- PDF
- PNG
- JPG

System converts to image layer.

Floorplan displayed as interactive canvas.

---

## Step 4 – Photo Capture

Workflow:


open floor
tap camera
scan barcode (optional)
capture photo
voice title
tap location on floorplan
save


Automatically captured metadata:


timestamp
gps
heading
device orientation


---

# 5. Photo Metadata Format

Example record:


photo_id: P023
title: Rack 7 front elevation
timestamp: 2026-03-10T11:23:02
gps: 35.6762,139.6503
heading: 245
barcode: RACK-07
plan_x: 0.42
plan_y: 0.63


---

# 6. Floorplan Mapping

Floorplan rendered in canvas.

Photo markers:


dot = camera position
arrow = viewing direction


Data stored:


plan_x
plan_y
heading


Normalized coordinates (0–1).

---

# 7. Barcode Tagging

Barcode scan before photo.

Typical tags:


RACK-07
ONU-3421
PATCH-PANEL-02


Photos automatically grouped by asset.

---

# 8. Annotation Tools

Basic markup tools:

- arrow
- rectangle
- highlight
- text

Annotations saved as JSON geometry.

Example:


{
type: "arrow",
start: [100,200],
end: [220,210]
}


---

# 9. Offline Support

Use:


IndexedDB
Service Workers


Photos stored locally until sync.

Background sync pushes to cloud when online.

---

# 10. Report Generation

Generate structured report:

Sections:


Project info
Survey details
Floorplans with markers
Photo sections


Example:


Photo 023
Rack 07 front elevation

timestamp
GPS link

image


Export formats:

- PDF
- ZIP archive
- Markdown

---

# 11. File Naming Convention

Automatic naming:


SITE-FLOOR-SEQ-TITLE.jpg


Example:


OTM-10F-023-RACK07-FRONT.jpg


---

# 12. Security

Authentication options:

- Google login
- email/password

Permissions:


admin
editor
viewer


---

# 13. UI Layout

## Main Screens

1. Project List
2. Survey Dashboard
3. Floorplan View
4. Camera Capture Screen
5. Photo Detail
6. Report Export

---

# 14. Camera Screen UI

Essential controls:

[scan barcode]
[photo button]
[voice note]
[annotate]
[save]


After photo:

tap location on floorplan


---

# 15. Development Phases

## Phase 1 – MVP (1–2 weeks)

Features:

- photo capture
- metadata
- project structure
- cloud storage

---

## Phase 2 – Survey Tools

Add:

- voice titles
- floorplan pinning

---

## Phase 3 – Advanced Features

Add:

- barcode scanner
- annotation
- report generation
- offline sync

---

# 16. Future Enhancements

Potential features:

- AI object recognition (identify devices)
- automatic rack layout extraction
- video survey mode
- AR positioning
- integration with asset databases

---

# 18. Deployment

PWA deployment:


Vercel
or
Firebase Hosting
or
Cloudflare Pages


Capabilities:

- installable on mobile
- offline support
- no app store required
