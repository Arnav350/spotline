# SPOTLINE

Professional stage management and choreography software for Broadway productions and major entertainment clients.

## Stack

- **Frontend**: React 18 + Vite + TypeScript
- **Styling**: Tailwind CSS (dark theme)
- **Canvas**: Konva.js / react-konva (2D formation editor)
- **3D**: Three.js / @react-three/fiber (3D perspective view)
- **State**: Zustand
- **Backend**: Supabase (database, realtime, storage)
- **Audio**: Web Audio API

## Features

- Multi-formation timeline with reorder, duration & transition controls
- Performers with name, color, shape (circle/square/triangle/star)
- Props with size and independent per-formation positioning
- Configurable stage (dimensions, divisions, subdivisions, unit)
- MP3 music upload with playback, scrubbing, and formation sync
- 3D perspective view with orbit controls
- Full undo/redo history (⌘Z / ⌘⇧Z, Delete key)
- Real-time collaboration via Supabase realtime subscriptions
- Auto-save to Supabase or localStorage (offline mode)
- Share shows via URL

## Quick Start (without Supabase)

```bash
npm install
npm run dev
```

The app works offline using `localStorage`. Create a show, share the URL — everything persists locally.

## Supabase Setup

1. Create a project at [supabase.com](https://supabase.com)
2. Run `supabase/schema.sql` in the SQL Editor
3. Copy your project URL and anon key
4. Create `.env.local`:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

5. Restart `npm run dev`

With Supabase configured, shows persist to the database, real-time collaboration works across users, and music files upload to Supabase Storage.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘Z` | Undo |
| `⌘⇧Z` | Redo |
| `Delete` / `Backspace` | Delete selected performer/prop |
| `Esc` | Deselect |
