# Graph Report - spotline  (2026-09-16)

## Corpus Check
- 63 files · ~54,546 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 372 nodes · 796 edges · 41 communities (13 shown, 28 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.79)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `32c2d3f2`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Editor Panels & Modals|Editor Panels & Modals]]
- [[_COMMUNITY_AI Formation Generation Logic|AI Formation Generation Logic]]
- [[_COMMUNITY_Dashboard & App Shell|Dashboard & App Shell]]
- [[_COMMUNITY_Project Documentation|Project Documentation]]
- [[_COMMUNITY_Dev Tooling Config|Dev Tooling Config]]
- [[_COMMUNITY_3D Stage Canvas|3D Stage Canvas]]
- [[_COMMUNITY_Core Dependencies|Core Dependencies]]
- [[_COMMUNITY_TS Config (App)|TS Config (App)]]
- [[_COMMUNITY_TS Config (Node)|TS Config (Node)]]
- [[_COMMUNITY_AI Generation Serverless Function|AI Generation Serverless Function]]
- [[_COMMUNITY_TS Project References|TS Project References]]
- [[_COMMUNITY_Favicon Icon|Favicon Icon]]
- [[_COMMUNITY_Social Icon Set|Social Icon Set]]
- [[_COMMUNITY_Hero Marketing Image|Hero Marketing Image]]
- [[_COMMUNITY_React Logo Asset|React Logo Asset]]
- [[_COMMUNITY_Vite Logo Asset|Vite Logo Asset]]
- [[_COMMUNITY_FormationMetrics.tsx|FormationMetrics.tsx]]
- [[_COMMUNITY_CLAUDE|CLAUDE.md]]
- [[_COMMUNITY_3D perspective view with orbit controls|3D perspective view with orbit controls]]
- [[_COMMUNITY_Auto-save to Supabase or localStorage (offline mode)|Auto-save to Supabase or localStorage (offline mode)]]
- [[_COMMUNITY_Configurable stage (dimensions, divisions, subdivisions, unit)|Configurable stage (dimensions, divisions, subdivisions, unit)]]
- [[_COMMUNITY_.env.local (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)|.env.local (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)]]
- [[_COMMUNITY_Multi-formation timeline|Multi-formation timeline]]
- [[_COMMUNITY_Konva.js  react-konva|Konva.js / react-konva]]
- [[_COMMUNITY_MP3 music upload with playbackscrubbingformation sync|MP3 music upload with playback/scrubbing/formation sync]]
- [[_COMMUNITY_Performers (name, color, shape)|Performers (name, color, shape)]]
- [[_COMMUNITY_Props (size, per-formation positioning)|Props (size, per-formation positioning)]]
- [[_COMMUNITY_Quick Start (without Supabase, offline localStorage mode)|Quick Start (without Supabase, offline localStorage mode)]]
- [[_COMMUNITY_Real-time collaboration via Supabase realtime subscriptions|Real-time collaboration via Supabase realtime subscriptions]]
- [[_COMMUNITY_Share shows via URL|Share shows via URL]]
- [[_COMMUNITY_Supabase (backend)|Supabase (backend)]]
- [[_COMMUNITY_Tailwind CSS (dark theme)|Tailwind CSS (dark theme)]]
- [[_COMMUNITY_Three.js  @react-threefiber|Three.js / @react-three/fiber]]
- [[_COMMUNITY_TypeScript|TypeScript]]
- [[_COMMUNITY_Full undoredo history|Full undo/redo history]]
- [[_COMMUNITY_Vite|Vite]]
- [[_COMMUNITY_Web Audio API|Web Audio API]]
- [[_COMMUNITY_Zustand (state management)|Zustand (state management)]]
- [[_COMMUNITY_supabaseschema.sql|supabase/schema.sql]]

## God Nodes (most connected - your core abstractions)
1. `useShowStore` - 47 edges
2. `colors` - 28 edges
3. `fontSize` - 25 edges
4. `radius` - 23 edges
5. `spacing` - 23 edges
6. `fontWeight` - 18 edges
7. `compilerOptions` - 17 edges
8. `isSupabaseConfigured()` - 16 edges
9. `compilerOptions` - 16 edges
10. `ShowState` - 14 edges

## Surprising Connections (you probably didn't know these)
- `useWindowSize()` --indirect_call--> `handler()`  [INFERRED]
  src/App.tsx → netlify/functions/generate-formation.ts
- `OnlineIndicator()` --indirect_call--> `handler()`  [INFERRED]
  src/components/TopBar.tsx → netlify/functions/generate-formation.ts
- `UserMenu()` --indirect_call--> `handler()`  [INFERRED]
  src/components/TopBar.tsx → netlify/functions/generate-formation.ts
- `Dashboard()` --references--> `react`  [EXTRACTED]
  src/components/Dashboard.tsx → package.json
- `index.html (app entry HTML)` --conceptually_related_to--> `SPOTLINE`  [INFERRED]
  index.html → README.md

## Import Cycles
- None detected.

## Communities (41 total, 28 thin omitted)

### Community 0 - "Editor Panels & Modals"
Cohesion: 0.07
Nodes (57): Tab, ContextMenu, FormationTimeline(), AIPanel(), AIPanelProps, AudioPanel(), AudioPanelProps, SegmentRow() (+49 more)

### Community 1 - "AI Formation Generation Logic"
Cohesion: 0.08
Nodes (35): AudioSegmentBarProps, FormationBarProps, AIGeneratedPosition, AIGenerationOptions, AIGenerationResult, AIUsage, generateFormation(), getAIUsage() (+27 more)

### Community 2 - "Dashboard & App Shell"
Cohesion: 0.08
Nodes (44): App(), useWindowSize(), AuthModal(), Dashboard(), DashboardProps, ProjectCard(), ProjectCardProps, SelectedView (+36 more)

### Community 3 - "Project Documentation"
Cohesion: 0.15
Nodes (12): Google Fonts Inter, index.html (app entry HTML), #root div mount point, Spotline Formations (page title), Features, Keyboard Shortcuts, Quick Start (without Supabase), React 18 (+4 more)

### Community 4 - "Dev Tooling Config"
Cohesion: 0.12
Nodes (17): devDependencies, autoprefixer, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, playwright (+9 more)

### Community 5 - "3D Stage Canvas"
Cohesion: 0.15
Nodes (16): SceneContent(), SceneContentProps, Stage3D(), CanvasProps, StageCanvas(), useStageInteraction(), UseStageInteractionParams, useZoomPan() (+8 more)

### Community 6 - "Core Dependencies"
Cohesion: 0.07
Nodes (28): dependencies, @anthropic-ai/sdk, @hello-pangea/dnd, konva, lucide-react, @netlify/functions, react, react-colorful (+20 more)

### Community 7 - "TS Config (App)"
Cohesion: 0.11
Nodes (18): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection, moduleResolution (+10 more)

### Community 8 - "TS Config (Node)"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution, noEmit (+9 more)

### Community 9 - "AI Generation Serverless Function"
Cohesion: 0.23
Nodes (11): client, extractJsonArray(), GenerateRequest, getAuthToken(), getUsageCount(), handler(), PerformerInput, PositionInput (+3 more)

### Community 18 - "FormationMetrics.tsx"
Cohesion: 0.23
Nodes (14): describeBalance(), FormationMetrics(), MetricRow(), MetricStatus, statusIcon(), orientation(), pathCrossingPairs(), PerformerPath (+6 more)

## Knowledge Gaps
- **160 isolated node(s):** `PerformerInput`, `PositionInput`, `GenerateRequest`, `PositionOutput`, `client` (+155 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **28 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Dashboard()` connect `Dashboard & App Shell` to `Editor Panels & Modals`, `Core Dependencies`?**
  _High betweenness centrality (0.162) - this node is a cross-community bridge._
- **Why does `react` connect `Core Dependencies` to `Dashboard & App Shell`?**
  _High betweenness centrality (0.159) - this node is a cross-community bridge._
- **What connects `PerformerInput`, `PositionInput`, `GenerateRequest` to the rest of the system?**
  _161 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Editor Panels & Modals` be split into smaller, more focused modules?**
  _Cohesion score 0.06855995410212277 - nodes in this community are weakly interconnected._
- **Should `AI Formation Generation Logic` be split into smaller, more focused modules?**
  _Cohesion score 0.07908163265306123 - nodes in this community are weakly interconnected._
- **Should `Dashboard & App Shell` be split into smaller, more focused modules?**
  _Cohesion score 0.07957393483709273 - nodes in this community are weakly interconnected._
- **Should `Dev Tooling Config` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._