# Survey Photo Album — Implementation Plan

## Overview

Mobile-first photo survey tool for site visits. Users capture photos, add titles (keyboard or voice), organize by project, and share albums with team members. Built on existing `$lib` Firestore/auth/UI infrastructure.

## Route & File Structure

```
src/routes/survey/
├── +page.svelte              # Entry: auth gate, Firestore subscriptions, router
├── implement.md              # This plan
├── parts/
│   ├── SurveyHome.svelte     # Project list + create new
│   ├── SurveyDetail.svelte   # Photo grid + camera trigger for one project
│   ├── Camera.svelte         # Full-screen camera capture overlay
│   ├── PhotoEditor.svelte    # Post-capture: title, description, voice, save
│   ├── PhotoView.svelte      # Full-screen photo viewer with edit/delete
│   ├── PhotoGrid.svelte      # Responsive grid of photo thumbnails
│   ├── VoiceInput.svelte     # Input with mic button (Web Speech API)
│   └── ShareDialog.svelte    # Copy share link / toggle public
├── survey.svelte.ts          # Reactive state & Firestore helpers
└── types.ts                  # TypeScript interfaces
```

## Data Model (Firestore)

### Collection: `surveys/{surveyId}`

```ts
interface Survey {
  id: string             // nanoid via db.create()
  name: string
  description?: string
  date: string           // ISO date of survey
  ownerId: string        // Firebase auth uid
  ownerName?: string
  shareToken?: string    // Random token for public sharing
  isPublic: boolean
  photoCount: number     // Denormalized for list display
  coverPhoto?: string    // URL of first/selected photo
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

### Collection: `surveys/{surveyId}/photos/{photoId}`

```ts
interface SurveyPhoto {
  id: string
  title: string
  description?: string
  imageUrl: string       // UploadThing URL
  thumbnailUrl?: string  // Smaller version (or same URL with resize params)
  latitude?: number
  longitude?: number
  capturedAt: Timestamp
  createdAt: Timestamp
  sortOrder: number      // For manual reordering
}
```

## Reusable `$lib` Components

| Component | Usage |
|-----------|-------|
| `Session` | Auth gate — require login before showing survey UI |
| `Firestore` | `subscribeMany('surveys')`, `subscribeWhere` by ownerId, subcollection subscriptions |
| `Button` | All actions — primary/outline/ghost/danger variants, loading states |
| `Input` | Title, description fields (multiline for description) |
| `Dialog` | Create survey, confirm delete, share |
| `Icon` | `camera`, `mic`, `micOff`, `trash`, `share2`, `plus`, `arrowLeft`, `image`, `mapPin` |
| `Spinner` | Loading states while Firestore data loads |
| `Search` | Filter surveys on home screen |
| `Dropdown` | Photo action menu (edit, delete) |

## Implementation Phases

### Phase 1: Foundation

**`types.ts`** — Define `Survey` and `SurveyPhoto` interfaces.

**`survey.svelte.ts`** — Reactive state class:
- `surveys: Survey[]` — subscribed list filtered by `ownerId`
- `currentSurvey: Survey | null` — active survey
- `photos: SurveyPhoto[]` — photos for current survey
- `createSurvey(name, date)` → `db.create('surveys', {...})`
- `deleteSurvey(id)` → delete doc + subcollection photos
- `savePhoto(surveyId, photoData)` → `db.create('surveys/${surveyId}/photos', {...})`
- `deletePhoto(surveyId, photoId)` → `db.delete(...)`
- `updatePhoto(surveyId, photoId, fields)` → `db.save(...)`
- `togglePublic(surveyId)` → generate/clear `shareToken`, toggle `isPublic`

**`+page.svelte`** — Entry point:
- Import `Session`, `Firestore` from `$lib`
- Auth gate: show login prompt if no user
- Simple client-side view state: `'home' | 'detail' | 'camera' | 'photo'`
- Pass `db`, `session.user`, view state to child components
- Subscribe to `surveys` collection where `ownerId == user.uid`

### Phase 2: Survey List (SurveyHome)

**`SurveyHome.svelte`**:
- List of survey cards showing name, date, photo count, cover thumbnail
- Search/filter bar using `Search` component
- "New Survey" button → `Dialog` with name + date inputs
- Tap card → navigate to detail view
- Swipe-to-delete or long-press menu (mobile UX)
- Empty state with illustration/prompt

### Phase 3: Survey Detail (SurveyDetail + PhotoGrid)

**`SurveyDetail.svelte`**:
- Header: survey name, date, back arrow, share button, edit/delete menu
- `PhotoGrid` component showing all photos
- Floating action button (FAB) at bottom-right → opens camera
- Photo count badge

**`PhotoGrid.svelte`**:
- CSS Grid: `grid-template-columns: repeat(auto-fill, minmax(150px, 1fr))`
- Lazy-load images with `loading="lazy"`
- Each cell: thumbnail, title overlay at bottom, location pin icon if geo available
- Tap → open `PhotoView`
- Empty state when no photos

### Phase 4: Camera Capture

**`Camera.svelte`**:
- Full-screen overlay (`fixed inset-0 z-50 bg-black`)
- `navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })`
- Video preview fills screen
- Bottom bar: capture button (centered), switch camera button, close button
- Capture flow:
  1. Draw video frame to offscreen `<canvas>`
  2. `canvas.toBlob('image/jpeg', 0.85)` → create `File` object
  3. Flash effect (white overlay fade)
  4. Pass blob to `PhotoEditor`
- Handle permissions denied gracefully with message + settings link
- Fallback: `<input type="file" accept="image/*" capture="environment">` for browsers without getUserMedia

### Phase 5: Photo Editor (Post-Capture)

**`PhotoEditor.svelte`**:
- Shows captured photo preview (object-fit: contain)
- Title input with `VoiceInput` (keyboard + mic)
- Description input (multiline) with `VoiceInput`
- Location display if geo available (lat/lng, small map link)
- Action buttons: Save, Retake, Cancel
- On save:
  1. Upload photo via UploadThing (`imageUploader` route — already configured)
  2. Create Firestore doc in `surveys/{id}/photos` with URL + metadata
  3. Update survey `photoCount` and `coverPhoto`
  4. Return to detail view

**`VoiceInput.svelte`**:
- Wraps `Input` from `$lib` with a mic toggle button
- Uses `webkitSpeechRecognition` / `SpeechRecognition` API
- `lang: 'ja'` (app locale is Japanese)
- States: idle, listening (pulsing red dot), error
- Appends recognized text to current input value
- Falls back to plain input if Speech API unavailable
- Continuous mode: keeps listening until user taps stop

### Phase 6: Photo Viewer

**`PhotoView.svelte`**:
- Full-screen image view with pinch-to-zoom (CSS `touch-action: manipulation`)
- Overlay header: back arrow, edit button, delete button
- Bottom info panel: title, description, timestamp, location
- Edit mode: inline edit title/description with voice
- Delete: confirm dialog → remove from Firestore + update counts
- Swipe left/right to navigate between photos

### Phase 7: Sharing

**`ShareDialog.svelte`**:
- Toggle: "Make album public" switch
- On enable: generate `shareToken` (nanoid), save to survey doc
- Display share URL: `{origin}/survey/share/{shareToken}`
- Copy-to-clipboard button
- QR code generation (optional, future)

**Shared view route** (future — `src/routes/survey/share/[token]/+page.svelte`):
- Server load: query Firestore where `shareToken == token` and `isPublic == true`
- Read-only photo grid, no auth required
- App branding + "Create your own" CTA

## Upload Strategy

Use existing `imageUploader` UploadThing route (already supports 4MB × 20 images). For survey photos:
1. Capture → JPEG blob at 85% quality
2. Resize client-side if >2048px on longest edge (canvas downscale)
3. Upload via `createUploadThing('imageUploader')` from `uploadthing/svelte`
4. Store returned `ufsUrl` in Firestore photo doc

Consider bumping `imageUploader` max size to 8MB to accommodate higher-res phone cameras.

## Mobile-First Design

- **Viewport**: Full-height layouts using `h-dvh` (dynamic viewport height)
- **Touch targets**: Minimum 44×44px tap areas
- **Bottom navigation**: Primary actions at thumb-reach zone
- **Camera FAB**: Bottom-right floating button, 56px round
- **Swipe gestures**: Navigate photos, delete with swipe
- **Safe areas**: Respect `env(safe-area-inset-*)` for notch/home-indicator
- **Font sizes**: Minimum 16px inputs (prevents iOS zoom on focus)
- **Dark camera UI**: Black background for camera/viewer screens
- **Haptic feedback**: `navigator.vibrate(50)` on capture (where supported)

## Geo-Location

```ts
navigator.geolocation.getCurrentPosition(
  pos => ({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
  err => null, // Silently skip if denied
  { enableHighAccuracy: true, timeout: 5000 }
)
```
- Request on camera open, cache for session
- Display as coordinates with Google Maps link
- No map embed (keeps it lightweight)

## Voice Input (Web Speech API)

```ts
const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)()
recognition.lang = 'ja'       // Japanese locale
recognition.continuous = true
recognition.interimResults = true
```
- Feature-detect and hide mic button if unsupported
- Visual indicator: pulsing red dot while recording
- Append mode: new speech appends to existing text (with space separator)
- Handle `onerror` and `onend` gracefully

## Build Order (Recommended)

1. **`types.ts`** + **`survey.svelte.ts`** — Data layer
2. **`+page.svelte`** — Auth gate + view routing
3. **`SurveyHome.svelte`** — List + create
4. **`SurveyDetail.svelte`** + **`PhotoGrid.svelte`** — View photos
5. **`Camera.svelte`** — Capture photos
6. **`VoiceInput.svelte`** — Speech input widget
7. **`PhotoEditor.svelte`** — Post-capture editing + upload
8. **`PhotoView.svelte`** — View/edit/delete individual photos
9. **`ShareDialog.svelte`** — Public sharing

## Migration Path to Project-Scoped Route

The prototype lives at `/survey` for easy testing. Production deployment will move to `src/routes/projects/[pid]/survey/` so surveys are associated with a project:

- Add `projectId: string` field to `Survey` interface
- Change Firestore path to `surveys/{pid}` (or keep flat collection with `projectId` filter via `subscribeWhere`)
- Move `+page.svelte` to `src/routes/projects/[pid]/survey/+page.svelte` (receives `pid` from `$page.params`)
- `parts/` components are route-agnostic — they just receive data props, so no changes needed
- Titlebar integration: reuse project Titlebar with survey tab/nav

## Testing Notes

- The prototype lives at `/survey` (no project ID needed for now)
- Camera requires HTTPS or localhost (getUserMedia constraint)
- Test voice input on Chrome (best Speech API support)
- Test on actual mobile device early — camera/voice behave differently than desktop
- Use `pnpm dev --host` to test from phone on same network
