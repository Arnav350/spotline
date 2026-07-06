# Graph Report - .  (2026-07-05)

## Corpus Check
- Corpus is ~48,620 words - fits in a single context window. You may not need a graph.

## Summary
- 341 nodes · 752 edges · 18 communities (12 shown, 6 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 9 edges (avg confidence: 0.78)
- Token cost: 163,274 input · 0 output

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

## God Nodes (most connected - your core abstractions)
1. `useShowStore` - 45 edges
2. `colors` - 26 edges
3. `fontSize` - 23 edges
4. `radius` - 22 edges
5. `spacing` - 21 edges
6. `Spotline` - 20 edges
7. `compilerOptions` - 17 edges
8. `isSupabaseConfigured()` - 16 edges
9. `fontWeight` - 16 edges
10. `compilerOptions` - 16 edges

## Surprising Connections (you probably didn't know these)
- `useWindowSize()` --indirect_call--> `handler()`  [INFERRED]
  src/App.tsx → netlify/functions/generate-formation.ts
- `OnlineIndicator()` --indirect_call--> `handler()`  [INFERRED]
  src/components/TopBar.tsx → netlify/functions/generate-formation.ts
- `UserMenu()` --indirect_call--> `handler()`  [INFERRED]
  src/components/TopBar.tsx → netlify/functions/generate-formation.ts
- `Dashboard()` --references--> `react`  [EXTRACTED]
  src/components/Dashboard.tsx → package.json
- `index.html (app entry HTML)` --conceptually_related_to--> `Spotline`  [INFERRED]
  index.html → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Frontend/canvas/state/backend stack forms Spotline's architecture** — readme_react, readme_konva, readme_zustand, readme_supabase [EXTRACTED 0.90]
- **Dual persistence mode: localStorage offline vs Supabase online with realtime sync** — readme_auto_save, readme_realtime_collaboration, readme_supabase, readme_quick_start_offline [INFERRED 0.85]

## Communities (18 total, 6 thin omitted)

### Community 0 - "Editor Panels & Modals"
Cohesion: 0.08
Nodes (50): Tab, ContextMenu, FormationTimeline(), AIPanelProps, AudioPanel(), AudioPanelProps, SegmentRow(), CastPanel() (+42 more)

### Community 1 - "AI Formation Generation Logic"
Cohesion: 0.07
Nodes (43): AIPanel(), AudioSegmentBarProps, FormationBarProps, AIGeneratedPosition, AIGenerationOptions, AIGenerationResult, AIUsage, generateFormation() (+35 more)

### Community 2 - "Dashboard & App Shell"
Cohesion: 0.10
Nodes (36): App(), useWindowSize(), AuthModal(), Dashboard(), DashboardProps, ProjectCard(), ProjectCardProps, SelectedView (+28 more)

### Community 3 - "Project Documentation"
Cohesion: 0.08
Nodes (30): Google Fonts Inter, index.html (app entry HTML), #root div mount point, Spotline Formations (page title), 3D perspective view with orbit controls, Auto-save to Supabase or localStorage (offline mode), Configurable stage (dimensions, divisions, subdivisions, unit), .env.local (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) (+22 more)

### Community 4 - "Dev Tooling Config"
Cohesion: 0.07
Nodes (26): devDependencies, autoprefixer, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, playwright (+18 more)

### Community 5 - "3D Stage Canvas"
Cohesion: 0.15
Nodes (16): SceneContent(), SceneContentProps, Stage3D(), CanvasProps, StageCanvas(), useStageInteraction(), UseStageInteractionParams, useZoomPan() (+8 more)

### Community 6 - "Core Dependencies"
Cohesion: 0.11
Nodes (19): dependencies, @anthropic-ai/sdk, @hello-pangea/dnd, konva, lucide-react, @netlify/functions, react, react-colorful (+11 more)

### Community 7 - "TS Config (App)"
Cohesion: 0.11
Nodes (18): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection, moduleResolution (+10 more)

### Community 8 - "TS Config (Node)"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution, noEmit (+9 more)

### Community 9 - "AI Generation Serverless Function"
Cohesion: 0.23
Nodes (11): client, extractJsonArray(), GenerateRequest, getAuthToken(), getUsageCount(), handler(), PerformerInput, PositionInput (+3 more)

## Knowledge Gaps
- **140 isolated node(s):** `PerformerInput`, `PositionInput`, `GenerateRequest`, `PositionOutput`, `client` (+135 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `Core Dependencies` to `Dev Tooling Config`?**
  _High betweenness centrality (0.178) - this node is a cross-community bridge._
- **Why does `Dashboard()` connect `Dashboard & App Shell` to `Editor Panels & Modals`, `Core Dependencies`?**
  _High betweenness centrality (0.173) - this node is a cross-community bridge._
- **Why does `react` connect `Core Dependencies` to `Dashboard & App Shell`?**
  _High betweenness centrality (0.170) - this node is a cross-community bridge._
- **What connects `PerformerInput`, `PositionInput`, `GenerateRequest` to the rest of the system?**
  _141 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Editor Panels & Modals` be split into smaller, more focused modules?**
  _Cohesion score 0.07719298245614035 - nodes in this community are weakly interconnected._
- **Should `AI Formation Generation Logic` be split into smaller, more focused modules?**
  _Cohesion score 0.06948051948051948 - nodes in this community are weakly interconnected._
- **Should `Dashboard & App Shell` be split into smaller, more focused modules?**
  _Cohesion score 0.09693877551020408 - nodes in this community are weakly interconnected._