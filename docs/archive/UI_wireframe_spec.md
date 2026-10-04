
# Structured Cabling App — Drawing UI Wireframe Specification

## Purpose

This document describes the UI layout and behavior for a multi‑drawing structured cabling design application.
It is intended to be used by:

- LLMs (for UI generation)
- Developers
- UI/UX designers
- Prototyping tools (Figma, React, etc.)

This structure scales nicely for:
- Multiple floors
- Rack elevations
- Patch panels
- Fill rate drawings
- Photo surveys
- Packages & versions

---

# Overall Layout

Desktop-first application layout:

┌─────────────────────────────────────────────────────────────┐
│ Top Bar                                                     │
├──────────────┬──────────────────────────────┬───────────────┤
│ Left Panel   │ Main Canvas                  │ Right Panel    │
│ Navigator    │ Drawing Area                 │ Layers/Props   │
├──────────────┴──────────────────────────────┴───────────────┤
│ Drawing Tabs                                                │
├─────────────────────────────────────────────────────────────┤
│ Bottom Status Bar                                           │
└─────────────────────────────────────────────────────────────┘

---

# Top Bar

Contains:

## Elements

### Project Selector
Dropdown

Example:
Project: Global Tech HQ

### Package Selector

Dropdown:

- Concept Design
- Schematic Design
- Detailed Design
- RFP Drawings
- Shop Drawings
- As Built

### Version Selector

Dropdown:

- v1
- v2
- v3

### Revision Selector

Dropdown:

- A
- B
- C

### Global Search

Search drawings

### User Menu

Icons:

- Notifications
- Settings
- User avatar

---

# Left Panel — Drawing Navigator

Tree view organized by:

Structure:

Drawings
 ├── Floors
 │    ├── Floor 1
 │    │    ├── High Level Outlets
 │    │    ├── Low Level Outlets
 │    │    ├── Trunk Routes
 │    │    ├── Fill Rate
 │
 ├── Server Rooms
 │    ├── SR‑01
 │    │    ├── Rack Row A Front
 │    │    ├── Rack Row A Rear
 │    │    ├── Wall Elevation
 │
 ├── Data Center
 │    ├── Row A
 │    │    ├── Front Elevation
 │    │    ├── Rear Elevation

Features:

- Expand/collapse
- Drag reorder
- Context menu
- Search filter
- Favorites

---

# Drawing Tabs

Example:

[Floor 3 Outlets] [Rack Row A] [Fill Rate] [+]

Features:

- Close tab
- Drag reorder
- Pin tab
- Middle-click close

---

# Main Canvas

Drawing area

Features:

- Zoom
- Pan
- Grid
- Snap
- Minimap

Toolbar above canvas:

Select | Pan | Zoom | Draw | Text | Cable | Rack | Measure

---

# Right Panel — Layers & Properties

Tabs:

- Layers
- Properties

Layers Example:

View Presets

High Level Outlets

☑ Outlets - High
☑ Outlets - Low
☑ Trunk Routes
☑ Rooms
☑ Labels

Features:

- Toggle visibility
- Lock layer
- Color indicator

---

# Quick Switcher (Command Palette)

Shortcut:

Ctrl + K

Search:

Floor 3
Rack Row A
SR01

---

# Package Preview Panel

Shows drawings included in package

Example:

Detailed Design

F1 High Level
F1 Low Level
Rack Row A
Fill Rate

---

# Bottom Status Bar

Displays:

- Coordinates
- Grid status
- Snap status
- Zoom level

Example:

X: 12450 Y: 8400 | Grid ON | Snap ON | 1:100

---

# Navigation Behavior

Switch Drawing:

- Click tree item
- Click tab
- Quick search

Switch Version:

- Top dropdown

Switch Package:

- Top dropdown

---

# Recommended Interaction Behavior

- Lazy load drawings
- Cache recent drawings
- Smooth transitions
- Keep zoom state per drawing

---

# Data Model Requirements

Each drawing:

Drawing
 ├── id
 ├── name
 ├── type
 ├── location
 ├── versions

---

# UI Components List

Required components:

- TreeView
- Tabs
- Toolbar
- Canvas
- Layer Panel
- Version Selector
- Package Selector
- Quick Search

---

# Recommended Tech Stack

React:
- React
- Tailwind
- Zustand

Svelte (Recommended):
- Svelte 5
- Tailwind
- Bits UI

---

# Future Features

- Compare versions
- Diff viewer
- Redlines
- Review workflow
- PDF publish

---

End
