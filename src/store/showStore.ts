import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type {
  Show,
  Formation,
  Performer,
  Prop,
  PerformerPosition,
  PropPosition,
  StageConfig,
  SelectableItem,
  HistoryEntry,
  HistorySnapshot,
  HistoryPatch,
  ArrayPatchEntry,
  Shape,
  PerformerGroup,
  AudioSegment,
  ShowMemberRole,
} from '../lib/types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { hungarian } from '../lib/hungarian';
import { colors } from '../lib/theme';
import { APP_COLORS } from '../lib/colors';


interface SpotlineClipboardItem {
  type: 'performer' | 'prop';
  name: string;
  color: string;
  shape: Shape;
  size?: number;
  x: number;
  y: number;
  departurePath?: { cpDx: number; cpDy: number };
}
let _memClipboard: SpotlineClipboardItem[] | null = null;

const DEFAULT_STAGE: StageConfig = {
  width: 60,
  height: 40,
  divisionsX: 5,
  divisionsY: 5,
  subdivisionsX: 2,
  subdivisionsY: 2,
  unit: 'ft',
};


export interface CollaboratorState {
  user_id: string;
  name: string;
  color: string;
  active_formation_id?: string | null;
}

interface ShowState {
  show: Show | null;
  formations: Formation[];
  performers: Performer[];
  props: Prop[];
  performerPositions: Record<string, PerformerPosition>;
  propPositions: Record<string, PropPosition>;
  activeFormationId: string | null;
  selectedItem: SelectableItem;
  selectedItemIds: string[];
  performerPaths: Record<string, { cpDx: number; cpDy: number }>;
  audioSegments: AudioSegment[];
  selectedAudioSegmentId: string | null;
  audioVolume: number;
  audioMuted: boolean;
  performerGroups: PerformerGroup[];
  viewMode: '2d' | '3d';
  isLoading: boolean;
  collaborators: CollaboratorState[];
  localUserId: string;
  localUserName: string;
  localUserColor: string;
  currentUserRole: ShowMemberRole | null;
  toasts: Array<{ id: string; message: string; type: 'info' | 'success' | 'warning' | 'error' }>;
  realtimeConnected: boolean;
  history: HistoryEntry[];
  historyIndex: number;
  isSaving: boolean;

  loadShow: (showId: string) => Promise<void>;
  createShow: () => Promise<string>;
  setLocalUser: (id: string, name: string, color: string) => void;
  updateShowTitle: (title: string) => void;
  updateShowBpm: (bpm: number | undefined) => void;
  updateStageConfig: (config: Partial<StageConfig>) => void;

  addFormation: () => void;
  addFormationAfter: (id: string) => void;
  duplicateFormation: (id: string) => void;
  deleteFormation: (id: string) => Promise<void>;
  updateFormation: (id: string, updates: Partial<Formation>) => void;
  reorderFormations: (sourceIndex: number, destIndex: number) => void;
  resetFormationToPrev: (id: string) => void;
  pastePositionsToFormation: (id: string, positions: { performers: Record<string, { x: number; y: number }>; props: Record<string, { x: number; y: number }> }) => void;
  pendingTransitionDuration: number | null;
  setActiveFormation: (id: string, transitionDuration?: number) => void;

  // Playback / animation state
  isPlaying: boolean;
  isAnimating: boolean;
  rawAnimProgress: number;
  animFromFormationId: string | null;
  setIsPlaying: (playing: boolean) => void;
  setAnimationState: (fromId: string, progress: number) => void;
  setRawAnimProgress: (p: number) => void;
  endAnimation: () => void;

  addPerformer: () => void;
  deletePerformer: (id: string) => Promise<void>;
  updatePerformer: (id: string, updates: Partial<Performer>) => void;
  movePerformer: (performerId: string, formationId: string, x: number, y: number) => void;
  bulkSetPerformerPositions: (formationId: string, updates: { id: string; x: number; y: number }[]) => void;

  addProp: () => void;
  deleteProp: (id: string) => Promise<void>;
  updateProp: (id: string, updates: Partial<Prop>) => void;
  moveProp: (propId: string, formationId: string, x: number, y: number) => void;

  setSelectedItem: (item: SelectableItem) => void;
  setSelectedItemIds: (ids: string[]) => void;
  toggleItemSelected: (id: string) => void;
  selectAllItems: () => void;
  copySelectedPerformers: () => void;
  pastePerformers: () => void;

  nudgeSelected: (dx: number, dy: number) => void;

  setPerformerPath: (performerId: string, fromFormationId: string, toFormationId: string, cpDx: number, cpDy: number) => void;
  clearPerformerPath: (performerId: string, fromFormationId: string, toFormationId: string) => void;
  optimizeFormationTransition: (fromFormationId: string, toFormationId: string) => void;
  arrangeSelectedPerformers: (shape: 'line-h' | 'line-v' | 'circle' | 'grid') => void;
  mirrorSelectedPerformers: (axis: 'horizontal' | 'vertical') => void;
  rotateSelectedPerformers: (degrees: 90 | 180 | 270) => void;

  addPerformerGroup: () => void;
  deletePerformerGroup: (id: string) => Promise<void>;
  updatePerformerGroup: (id: string, updates: Partial<PerformerGroup>) => void;
  assignPerformerToGroup: (performerId: string, groupId: string | null) => void;

  setAudioVolume: (v: number) => void;
  setAudioMuted: (m: boolean) => void;

  addAudioSegment: () => void;
  updateAudioSegment: (id: string, changes: Partial<AudioSegment>) => void;
  deleteAudioSegment: (id: string) => Promise<void>;
  setSelectedAudioSegment: (id: string | null) => void;

  setViewMode: (mode: '2d' | '3d') => void;

  undo: () => void;
  redo: () => void;
  captureSnapshot: () => void;
  pushHistory: () => void;

  uploadMusic: (file: File) => Promise<void>;
  removeMusic: () => void;

  addToast: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  removeToast: (id: string) => void;
  setRealtimeConnected: (connected: boolean) => void;
  setCurrentUserRole: (role: ShowMemberRole | null) => void;

  isPublicView: boolean;
  loadPublicShow: (token: string) => Promise<void>;
}

function resolveSelectedItem(performers: Performer[], props: Prop[], ids: string[]): SelectableItem {
  if (ids.length !== 1) return null;
  const id = ids[0];
  if (performers.some(p => p.id === id)) return { type: 'performer', id };
  if (props.some(p => p.id === id)) return { type: 'prop', id };
  return null;
}

const MAX_HISTORY = 50;

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let nudgeHistoryTimeout: ReturnType<typeof setTimeout> | null = null;
const pathSaveTimers: Record<string, ReturnType<typeof setTimeout>> = {};

function schedulePathSave(performerId: string, toFormationId: string, cpDx: number, cpDy: number) {
  const key = `${performerId}-${toFormationId}`;
  if (pathSaveTimers[key]) clearTimeout(pathSaveTimers[key]);
  pathSaveTimers[key] = setTimeout(() => {
    delete pathSaveTimers[key];
    supabase.from('performer_positions')
      .update({ cp_dx: cpDx, cp_dy: cpDy })
      .eq('performer_id', performerId)
      .eq('formation_id', toFormationId)
      .then(() => {});
  }, 400);
}

function scheduleAutoSave(state: ShowState) {
  if (!state.show) return;
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    useShowStore.getState().persistAll();
  }, 800);
}

// Delta-based history restore: only revert keys that changed between `from` and `to`,
// leaving keys that remote users may have changed independently untouched.
// Baseline snapshot captured before each local action. Only updated by captureSnapshot(), never by remote changes.
let historyBaseline: HistorySnapshot | null = null;

function snapshotState(state: ShowState): HistorySnapshot {
  return {
    performers: JSON.parse(JSON.stringify(state.performers)),
    props: JSON.parse(JSON.stringify(state.props)),
    formations: JSON.parse(JSON.stringify(state.formations)),
    performerPositions: JSON.parse(JSON.stringify(state.performerPositions)),
    propPositions: JSON.parse(JSON.stringify(state.propPositions)),
    performerPaths: JSON.parse(JSON.stringify(state.performerPaths)),
    performerGroups: JSON.parse(JSON.stringify(state.performerGroups)),
  };
}

// Compute what changed between two snapshots. Only changed keys are stored; null means deleted.
function computePatch(from: HistorySnapshot, to: HistorySnapshot): HistoryPatch {
  const patch: HistoryPatch = {};

  function diffArray<T extends { id: string }>(fromArr: T[], toArr: T[]): Record<string, ArrayPatchEntry<T>> | undefined {
    const fromMap = Object.fromEntries(fromArr.map(x => [x.id, x]));
    const toMap = Object.fromEntries(toArr.map(x => [x.id, x]));
    const diff: Record<string, ArrayPatchEntry<T>> = {};
    let changed = false;
    for (const [id, item] of Object.entries(toMap)) {
      if (JSON.stringify(fromMap[id]) !== JSON.stringify(item)) {
        diff[id] = { op: fromMap[id] !== undefined ? 'update' : 'insert', data: JSON.parse(JSON.stringify(item)) };
        changed = true;
      }
    }
    for (const id of Object.keys(fromMap)) {
      if (!toMap[id]) { diff[id] = null; changed = true; }
    }
    return changed ? diff : undefined;
  }

  const performers = diffArray(from.performers, to.performers);
  if (performers) patch.performers = performers;
  const props = diffArray(from.props, to.props);
  if (props) patch.props = props;
  const formations = diffArray(from.formations, to.formations);
  if (formations) patch.formations = formations;
  const performerGroups = diffArray(from.performerGroups, to.performerGroups);
  if (performerGroups) patch.performerGroups = performerGroups;

  function diffRecord<T>(
    fromRec: Record<string, T>,
    toRec: Record<string, T>,
  ): Record<string, T | null> | undefined {
    const allKeys = new Set([...Object.keys(fromRec), ...Object.keys(toRec)]);
    const changes: Record<string, T | null> = {};
    let hasChanges = false;
    for (const k of allKeys) {
      if (JSON.stringify(fromRec[k]) !== JSON.stringify(toRec[k])) {
        changes[k] = toRec[k] ?? null;
        hasChanges = true;
      }
    }
    return hasChanges ? changes : undefined;
  }

  const pp = diffRecord(from.performerPositions, to.performerPositions);
  if (pp) patch.performerPositions = pp as Record<string, PerformerPosition | null>;

  const prp = diffRecord(from.propPositions, to.propPositions);
  if (prp) patch.propPositions = prp as Record<string, PropPosition | null>;

  const paths = diffRecord(from.performerPaths, to.performerPaths);
  if (paths) patch.performerPaths = paths as Record<string, { cpDx: number; cpDy: number } | null>;

  return patch;
}

function applyArrayPatch<T extends { id: string }>(patch: Record<string, ArrayPatchEntry<T>>, current: T[]): T[] {
  const result: T[] = [];
  for (const item of current) {
    const entry = patch[item.id];
    if (entry === null) continue;       // deleted
    result.push(entry ? entry.data : item); // updated or unchanged
  }
  for (const [id, entry] of Object.entries(patch)) {
    // Only re-insert items that A originally created; skip updates to remotely-deleted items.
    if (entry !== null && entry.op === 'insert' && !current.some(x => x.id === id)) {
      result.push(entry.data);
    }
  }
  return result;
}

function applyPatch(patch: HistoryPatch, current: ShowState): Partial<ShowState> {
  const result: Partial<ShowState> = {};

  if (patch.performers !== undefined)
    result.performers = applyArrayPatch(patch.performers, current.performers);
  if (patch.props !== undefined)
    result.props = applyArrayPatch(patch.props, current.props);
  if (patch.formations !== undefined)
    result.formations = applyArrayPatch(patch.formations, current.formations).sort((a, b) => a.order_index - b.order_index);
  if (patch.performerGroups !== undefined)
    result.performerGroups = applyArrayPatch(patch.performerGroups, current.performerGroups);

  if (patch.performerPositions !== undefined) {
    const pos = { ...current.performerPositions };
    for (const [k, v] of Object.entries(patch.performerPositions)) {
      if (v === null) delete pos[k]; else pos[k] = v as PerformerPosition;
    }
    result.performerPositions = pos;
  }

  if (patch.propPositions !== undefined) {
    const pos = { ...current.propPositions };
    for (const [k, v] of Object.entries(patch.propPositions)) {
      if (v === null) delete pos[k]; else pos[k] = v as PropPosition;
    }
    result.propPositions = pos;
  }

  if (patch.performerPaths !== undefined) {
    const paths = { ...current.performerPaths };
    for (const [k, v] of Object.entries(patch.performerPaths)) {
      if (v === null) delete paths[k]; else paths[k] = v as { cpDx: number; cpDy: number };
    }
    result.performerPaths = paths;
  }

  return result;
}

// Remove position/path keys that reference entities deleted by remote users.
// Runs on the fully-assembled applyPatch result so resurrected entities are already present.
function sanitize(result: Partial<ShowState>, current: ShowState): Partial<ShowState> {
  const performers = result.performers ?? current.performers;
  const props = result.props ?? current.props;
  const formations = result.formations ?? current.formations;
  const performerIds = new Set(performers.map(p => p.id));
  const propIds = new Set(props.map(p => p.id));
  const formationIds = new Set(formations.map(f => f.id));

  if (result.performerPositions) {
    const cleaned: Record<string, PerformerPosition> = {};
    for (const [key, pos] of Object.entries(result.performerPositions)) {
      if (performerIds.has(pos.performer_id) && formationIds.has(pos.formation_id)) {
        cleaned[key] = pos;
      }
    }
    result.performerPositions = cleaned;
  }

  if (result.propPositions) {
    const cleaned: Record<string, PropPosition> = {};
    for (const [key, pos] of Object.entries(result.propPositions)) {
      if (propIds.has(pos.prop_id) && formationIds.has(pos.formation_id)) {
        cleaned[key] = pos;
      }
    }
    result.propPositions = cleaned;
  }

  if (result.performerPaths) {
    const cleaned: Record<string, { cpDx: number; cpDy: number }> = {};
    for (const key of Object.keys(result.performerPaths)) {
      // key = performerId(36)-fromFormationId(36)-toFormationId(36), each UUID is 36 chars
      const performerId = key.substring(0, 36);
      const fromFormationId = key.substring(37, 73);
      const toFormationId = key.substring(74, 110);
      if (performerIds.has(performerId) && formationIds.has(fromFormationId) && formationIds.has(toFormationId)) {
        cleaned[key] = result.performerPaths[key];
      }
    }
    result.performerPaths = cleaned;
  }

  return result;
}

function isPatchEmpty(patch: HistoryPatch): boolean {
  return patch.performers === undefined && patch.props === undefined &&
    patch.formations === undefined && patch.performerGroups === undefined &&
    patch.performerPositions === undefined && patch.propPositions === undefined &&
    patch.performerPaths === undefined;
}

// Broadcast formation/position changes produced by undo/redo so peers see them immediately.
function broadcastHistoryChanges(prev: ShowState, next: Partial<ShowState>) {
  const nextFormations = next.formations;
  const nextPerfPos = next.performerPositions ?? prev.performerPositions;
  const nextPropPos = next.propPositions ?? prev.propPositions;

  if (nextFormations) {
    const nextIds = new Set(nextFormations.map(f => f.id));
    for (const f of nextFormations) {
      const old = prev.formations.find(x => x.id === f.id);
      if (!old || JSON.stringify(old) !== JSON.stringify(f)) {
        (window as any).__spotlineBroadcastFormationUpsert?.({
          ...f,
          performerPositions: Object.values(nextPerfPos)
            .filter(p => p.formation_id === f.id)
            .map(p => ({ performerId: p.performer_id, formationId: p.formation_id, x: p.x, y: p.y })),
          propPositions: Object.values(nextPropPos)
            .filter(p => p.formation_id === f.id)
            .map(p => ({ propId: p.prop_id, formationId: p.formation_id, x: p.x, y: p.y })),
        });
      }
    }
    for (const f of prev.formations) {
      if (!nextIds.has(f.id)) (window as any).__spotlineBroadcastFormationDelete?.(f.id);
    }
    if (nextFormations.some(f => {
      const old = prev.formations.find(x => x.id === f.id);
      return old && old.order_index !== f.order_index;
    })) {
      (window as any).__spotlineBroadcastFormationsReorder?.(
        nextFormations.map(f => ({ id: f.id, order_index: f.order_index })),
      );
    }
  }

  const positionUpdates: { type: 'performer' | 'prop'; id: string; formationId: string; x: number; y: number }[] = [];
  if (next.performerPositions) {
    for (const [key, pos] of Object.entries(next.performerPositions)) {
      const old = prev.performerPositions[key];
      if (!old || old.x !== pos.x || old.y !== pos.y) {
        positionUpdates.push({ type: 'performer', id: pos.performer_id, formationId: pos.formation_id, x: pos.x, y: pos.y });
      }
    }
  }
  if (next.propPositions) {
    for (const [key, pos] of Object.entries(next.propPositions)) {
      const old = prev.propPositions[key];
      if (!old || old.x !== pos.x || old.y !== pos.y) {
        positionUpdates.push({ type: 'prop', id: pos.prop_id, formationId: pos.formation_id, x: pos.x, y: pos.y });
      }
    }
  }
  if (positionUpdates.length > 0) (window as any).__spotlineBroadcastPositions?.(positionUpdates);
}

export const useShowStore = create<ShowState & { persistAll: () => Promise<void> }>((set, get) => ({
  show: null,
  formations: [],
  performers: [],
  props: [],
  performerPositions: {},
  propPositions: {},
  activeFormationId: null,
  selectedItem: null,
  selectedItemIds: [],
  performerPaths: {},
  audioSegments: [],
  selectedAudioSegmentId: null,
  audioVolume: 1,
  audioMuted: false,
  performerGroups: [],
  viewMode: '2d',
  isLoading: false,
  collaborators: [],
  localUserId: uuidv4(),
  localUserName: 'Anonymous',
  localUserColor: colors.accent,
  currentUserRole: null,
  toasts: [],
  realtimeConnected: true,
  history: [],
  historyIndex: -1,
  isSaving: false,
  pendingTransitionDuration: null,
  isPlaying: false,
  isAnimating: false,
  rawAnimProgress: 0,
  animFromFormationId: null,
  isPublicView: false,

  loadShow: async (showId: string) => {
    set({ isLoading: true });
    if (!isSupabaseConfigured()) {
      const localData = localStorage.getItem(`show-${showId}`);
      if (localData) {
        const data = JSON.parse(localData);
        set({
          show: data.show,
          formations: data.formations || [],
          performers: data.performers || [],
          props: data.props || [],
          performerPositions: data.performerPositions || {},
          propPositions: data.propPositions || {},
          performerPaths: data.performerPaths || {},
          performerGroups: data.performerGroups || [],
          audioSegments: (data.audioSegments || [])
            .sort((a: any, b: any) => (a.order_index ?? a.start_time ?? 0) - (b.order_index ?? b.start_time ?? 0))
            .map((s: any, i: number) => ({ ...s, order_index: i, start_time: undefined })),
          activeFormationId: data.formations?.[0]?.id || null,
          currentUserRole: 'owner',
          history: [],
          historyIndex: -1,
          isLoading: false,
        });
      } else {
        const show: Show = {
          id: showId,
          title: 'Untitled Show',
          stage_config: DEFAULT_STAGE,
          music_url: null,
          music_filename: null,
        };
        set({ show, isLoading: false });
      }
      return;
    }

    try {
      const { data: show } = await supabase.from('shows').select('*').eq('id', showId).maybeSingle();
      const { data: formations } = await supabase.from('formations').select('*').eq('show_id', showId).order('order_index');
      const { data: performers } = await supabase.from('performers').select('*').eq('show_id', showId);
      const { data: props } = await supabase.from('props').select('*').eq('show_id', showId);
      const { data: perfPositions } = await supabase.from('performer_positions').select('*').in('formation_id', (formations || []).map(f => f.id));
      const { data: propPosData } = await supabase.from('prop_positions').select('*').in('formation_id', (formations || []).map(f => f.id));
      const { data: audioSegsData } = await supabase.from('audio_segments').select('*').eq('show_id', showId).order('order_index');
      const { data: performerGroupsData } = await supabase.from('performer_groups').select('*').eq('show_id', showId);

      const sortedFormations = (formations || []).slice().sort((a, b) => a.order_index - b.order_index);
      const performerPositions: Record<string, PerformerPosition> = {};
      const performerPaths: Record<string, { cpDx: number; cpDy: number }> = {};
      (perfPositions || []).forEach(p => {
        performerPositions[`${p.performer_id}-${p.formation_id}`] = p;
        if (p.cp_dx || p.cp_dy) {
          const toIdx = sortedFormations.findIndex(f => f.id === p.formation_id);
          if (toIdx > 0) {
            const fromFormationId = sortedFormations[toIdx - 1].id;
            performerPaths[`${p.performer_id}-${fromFormationId}-${p.formation_id}`] = { cpDx: p.cp_dx ?? 0, cpDy: p.cp_dy ?? 0 };
          }
        }
      });

      const propPositions: Record<string, PropPosition> = {};
      (propPosData || []).forEach(p => {
        propPositions[`${p.prop_id}-${p.formation_id}`] = p;
      });

      const { data: { user } } = await supabase.auth.getUser();
      let currentUserRole: ShowMemberRole | null = null;
      if (user) {
        const { data: memberRow } = await supabase
          .from('show_members')
          .select('role')
          .eq('show_id', showId)
          .eq('user_id', user.id)
          .maybeSingle();
        currentUserRole = memberRow?.role ?? null;
      }

      // Refresh signed URL for audio if storage path is present
      let resolvedShow = show;
      const storagePath = (show as any)?.music_storage_path;
      if (storagePath) {
        const { data: signedData } = await supabase.storage.from('audio').createSignedUrl(storagePath, 604800);
        if (signedData?.signedUrl) {
          resolvedShow = { ...show, music_url: signedData.signedUrl } as any;
        }
      }

      set({
        show: resolvedShow,
        formations: formations || [],
        performers: performers || [],
        props: props || [],
        performerPositions,
        propPositions,
        performerPaths,
        performerGroups: performerGroupsData || [],
        audioSegments: (audioSegsData || []).sort((a: any, b: any) => a.order_index - b.order_index),
        activeFormationId: formations?.[0]?.id || null,
        currentUserRole,
        history: [],
        historyIndex: -1,
        isLoading: false,
      });
    } catch {
      set({ isLoading: false });
    }
  },

  loadPublicShow: async (token: string) => {
    if (!isSupabaseConfigured()) return;
    set({ isLoading: true });
    try {
      const { data: showId } = await supabase.rpc('get_show_from_public_token', { public_token: token });
      if (!showId) {
        set({ isLoading: false });
        return;
      }

      const { data: show } = await supabase.from('shows').select('*').eq('id', showId).maybeSingle();
      const { data: formations } = await supabase.from('formations').select('*').eq('show_id', showId).order('order_index');
      const { data: performers } = await supabase.from('performers').select('*').eq('show_id', showId);
      const { data: props } = await supabase.from('props').select('*').eq('show_id', showId);
      const { data: perfPositions } = await supabase.from('performer_positions').select('*').in('formation_id', (formations || []).map((f: any) => f.id));
      const { data: propPosData } = await supabase.from('prop_positions').select('*').in('formation_id', (formations || []).map((f: any) => f.id));
      const { data: audioSegsData } = await supabase.from('audio_segments').select('*').eq('show_id', showId).order('order_index');
      const { data: performerGroupsData } = await supabase.from('performer_groups').select('*').eq('show_id', showId);

      const sortedFormations = (formations as any[] || []).slice().sort((a: any, b: any) => a.order_index - b.order_index);
      const performerPositions: Record<string, PerformerPosition> = {};
      const performerPaths: Record<string, { cpDx: number; cpDy: number }> = {};
      (perfPositions || []).forEach((p: any) => {
        performerPositions[`${p.performer_id}-${p.formation_id}`] = p;
        if (p.cp_dx || p.cp_dy) {
          const toIdx = sortedFormations.findIndex((f: any) => f.id === p.formation_id);
          if (toIdx > 0) {
            const fromFormationId = sortedFormations[toIdx - 1].id;
            performerPaths[`${p.performer_id}-${fromFormationId}-${p.formation_id}`] = { cpDx: p.cp_dx ?? 0, cpDy: p.cp_dy ?? 0 };
          }
        }
      });

      const propPositions: Record<string, PropPosition> = {};
      (propPosData || []).forEach((p: any) => {
        propPositions[`${p.prop_id}-${p.formation_id}`] = p;
      });

      let resolvedShow = show;
      const storagePath = (show as any)?.music_storage_path;
      if (storagePath) {
        const { data: signedData } = await supabase.storage.from('audio').createSignedUrl(storagePath, 604800);
        if (signedData?.signedUrl) {
          resolvedShow = { ...show, music_url: signedData.signedUrl } as any;
        }
      }

      set({
        show: resolvedShow,
        formations: formations || [],
        performers: performers || [],
        props: props || [],
        performerPositions,
        propPositions,
        performerPaths,
        performerGroups: performerGroupsData || [],
        audioSegments: (audioSegsData || []).sort((a: any, b: any) => a.order_index - b.order_index),
        activeFormationId: (formations as any[])?.[0]?.id || null,
        currentUserRole: 'viewer',
        isPublicView: true,
        history: [],
        historyIndex: -1,
        isLoading: false,
      });
    } catch {
      set({ isLoading: false });
    }
  },

  createShow: async () => {
    const id = uuidv4();
    const show: Show = {
      id,
      title: 'Untitled Show',
      stage_config: DEFAULT_STAGE,
      music_url: null,
      music_filename: null,
    };

    if (isSupabaseConfigured()) {
      const { data: { user } } = await supabase.auth.getUser();
      const ownerId = user?.id ?? null;
      await supabase.from('shows').insert({ ...show, owner_id: ownerId });
      if (ownerId) {
        await supabase.from('show_members').insert({ show_id: id, user_id: ownerId, role: 'owner' });
      }
    } else {
      localStorage.setItem(`show-${id}`, JSON.stringify({ show, formations: [], performers: [], props: [], performerPositions: {}, propPositions: {} }));
    }

    set({
      show,
      formations: [],
      performers: [],
      props: [],
      performerPositions: {},
      propPositions: {},
      performerPaths: {},
      performerGroups: [],
      audioSegments: [],
      selectedAudioSegmentId: null,
      activeFormationId: null,
      selectedItem: null,
      selectedItemIds: [],
      history: [],
      historyIndex: -1,
    });
    return id;
  },

  setLocalUser: (id: string, name: string, color: string) => {
    set({ localUserId: id, localUserName: name, localUserColor: color });
  },

  updateShowTitle: (title: string) => {
    set(s => ({ show: s.show ? { ...s.show, title } : null }));
    scheduleAutoSave(get());
  },

  updateShowBpm: (bpm: number | undefined) => {
    set(s => ({ show: s.show ? { ...s.show, bpm } : null }));
    scheduleAutoSave(get());
  },

  updateStageConfig: (config: Partial<StageConfig>) => {
    set(s => {
      if (!s.show) return {};
      const oldCfg = s.show.stage_config;
      const newCfg = { ...oldCfg, ...config };
      const scaleX = (config.width !== undefined && oldCfg.width > 0) ? newCfg.width / oldCfg.width : 1;
      const scaleY = (config.height !== undefined && oldCfg.height > 0) ? newCfg.height / oldCfg.height : 1;
      const rescalePositions = <T extends { x: number; y: number }>(positions: Record<string, T>): Record<string, T> => {
        if (scaleX === 1 && scaleY === 1) return positions;
        const result: Record<string, T> = {};
        for (const key in positions) {
          result[key] = { ...positions[key], x: positions[key].x * scaleX, y: positions[key].y * scaleY };
        }
        return result;
      };
      return {
        show: { ...s.show, stage_config: newCfg },
        performerPositions: rescalePositions(s.performerPositions),
        propPositions: rescalePositions(s.propPositions),
      };
    });
    scheduleAutoSave(get());
  },

  addFormation: () => {
    const state = get();
    if (!state.show) return;
    const id = uuidv4();
    const orderIndex = state.formations.length;
    const bpm = state.show.bpm;
    const defaultDuration = bpm && bpm > 0 ? (60 / bpm) * 8 : 8;
    const formation: Formation = {
      id,
      show_id: state.show.id,
      name: `Formation ${orderIndex + 1}`,
      notes: '',
      duration: defaultDuration,
      transition_duration: 2,
      transition_easing: 'ease',
      order_index: orderIndex,
    };
    const srcFormationId = state.activeFormationId;
    const newPerformerPositions = { ...state.performerPositions };
    state.performers.forEach(p => {
      const key = `${p.id}-${id}`;
      const srcPos = srcFormationId ? state.performerPositions[`${p.id}-${srcFormationId}`] : null;
      newPerformerPositions[key] = {
        id: uuidv4(),
        performer_id: p.id,
        formation_id: id,
        x: srcPos?.x ?? (state.show!.stage_config.width / 2 + (Math.random() - 0.5) * 10),
        y: srcPos?.y ?? (state.show!.stage_config.height / 2 + (Math.random() - 0.5) * 10),
      };
    });
    const newPropPositions = { ...state.propPositions };
    state.props.forEach(p => {
      const key = `${p.id}-${id}`;
      const srcPos = srcFormationId ? state.propPositions[`${p.id}-${srcFormationId}`] : null;
      newPropPositions[key] = {
        id: uuidv4(),
        prop_id: p.id,
        formation_id: id,
        x: srcPos?.x ?? state.show!.stage_config.width / 2,
        y: srcPos?.y ?? state.show!.stage_config.height / 2,
      };
    });
    get().captureSnapshot();
    set(s => ({
      formations: [...s.formations, formation],
      activeFormationId: id,
      performerPositions: newPerformerPositions,
      propPositions: newPropPositions,
    }));
    (window as any).__spotlineBroadcastFormationUpsert?.({
      ...formation,
      performerPositions: Object.values(newPerformerPositions)
        .filter(p => p.formation_id === id)
        .map(p => ({ performerId: p.performer_id, formationId: p.formation_id, x: p.x, y: p.y })),
      propPositions: Object.values(newPropPositions)
        .filter(p => p.formation_id === id)
        .map(p => ({ propId: p.prop_id, formationId: p.formation_id, x: p.x, y: p.y })),
    });
    get().pushHistory();
    scheduleAutoSave(get());
  },

  addFormationAfter: (id: string) => {
    const state = get();
    if (!state.show) return;
    const srcIdx = state.formations.findIndex(f => f.id === id);
    if (srcIdx === -1) return;
    const src = state.formations[srcIdx];
    const newId = uuidv4();
    const bpm = state.show.bpm;
    const defaultDuration = bpm && bpm > 0 ? (60 / bpm) * 8 : 8;
    const newFormation: Formation = {
      id: newId,
      show_id: state.show.id,
      name: `Formation ${state.formations.length + 1}`,
      notes: '',
      duration: defaultDuration,
      transition_duration: src.transition_duration,
      transition_easing: src.transition_easing,
      order_index: srcIdx + 1,
    };
    const newPerformerPositions = { ...state.performerPositions };
    state.performers.forEach(p => {
      const srcPos = state.performerPositions[`${p.id}-${id}`];
      newPerformerPositions[`${p.id}-${newId}`] = {
        id: uuidv4(),
        performer_id: p.id,
        formation_id: newId,
        x: srcPos?.x ?? state.show!.stage_config.width / 2,
        y: srcPos?.y ?? state.show!.stage_config.height / 2,
      };
    });
    const newPropPositions = { ...state.propPositions };
    state.props.forEach(p => {
      const srcPos = state.propPositions[`${p.id}-${id}`];
      newPropPositions[`${p.id}-${newId}`] = {
        id: uuidv4(),
        prop_id: p.id,
        formation_id: newId,
        x: srcPos?.x ?? state.show!.stage_config.width / 2,
        y: srcPos?.y ?? state.show!.stage_config.height / 2,
      };
    });
    const updated = [...state.formations];
    updated.splice(srcIdx + 1, 0, newFormation);
    const reindexed = updated.map((f, i) => ({ ...f, order_index: i }));
    get().captureSnapshot();
    set({ formations: reindexed, activeFormationId: newId, performerPositions: newPerformerPositions, propPositions: newPropPositions });
    get().pushHistory();
    scheduleAutoSave(get());
  },

  resetFormationToPrev: (id: string) => {
    const state = get();
    const idx = state.formations.findIndex(f => f.id === id);
    if (idx <= 0) return;
    const prevId = state.formations[idx - 1].id;
    const newPerformerPositions = { ...state.performerPositions };
    state.performers.forEach(p => {
      const prevPos = state.performerPositions[`${p.id}-${prevId}`];
      if (prevPos) {
        newPerformerPositions[`${p.id}-${id}`] = {
          ...newPerformerPositions[`${p.id}-${id}`],
          x: prevPos.x,
          y: prevPos.y,
        };
      }
    });
    const newPropPositions = { ...state.propPositions };
    state.props.forEach(p => {
      const prevPos = state.propPositions[`${p.id}-${prevId}`];
      if (prevPos) {
        newPropPositions[`${p.id}-${id}`] = {
          ...newPropPositions[`${p.id}-${id}`],
          x: prevPos.x,
          y: prevPos.y,
        };
      }
    });
    get().captureSnapshot();
    set({ performerPositions: newPerformerPositions, propPositions: newPropPositions });
    get().pushHistory();
    scheduleAutoSave(get());
  },

  pastePositionsToFormation: (id: string, positions: { performers: Record<string, { x: number; y: number }>; props: Record<string, { x: number; y: number }> }) => {
    const state = get();
    const newPerformerPositions = { ...state.performerPositions };
    Object.entries(positions.performers).forEach(([name, pos]) => {
      const performer = state.performers.find(p => p.name.toLowerCase() === name.toLowerCase());
      if (!performer) return;
      const key = `${performer.id}-${id}`;
      if (newPerformerPositions[key]) {
        newPerformerPositions[key] = { ...newPerformerPositions[key], x: pos.x, y: pos.y };
      }
    });
    const newPropPositions = { ...state.propPositions };
    Object.entries(positions.props).forEach(([name, pos]) => {
      const prop = state.props.find(p => p.name.toLowerCase() === name.toLowerCase());
      if (!prop) return;
      const key = `${prop.id}-${id}`;
      if (newPropPositions[key]) {
        newPropPositions[key] = { ...newPropPositions[key], x: pos.x, y: pos.y };
      }
    });
    get().captureSnapshot();
    set({ performerPositions: newPerformerPositions, propPositions: newPropPositions });
    get().pushHistory();
    scheduleAutoSave(get());
  },

  deleteFormation: async (id: string) => {
    const state = get();
    const idx = state.formations.findIndex(f => f.id === id);
    if (idx === -1) return;
    const isLast = idx === state.formations.length - 1;
    const deletedDuration = state.formations[idx].duration;
    const remaining = state.formations.filter(f => f.id !== id).map((f, i) => ({ ...f, order_index: i }));
    if (!isLast && remaining.length > 0) {
      const targetIdx = idx > 0 ? idx - 1 : 0;
      remaining[targetIdx] = { ...remaining[targetIdx], duration: remaining[targetIdx].duration + deletedDuration };
    }
    const newActive = remaining.length > 0 ? remaining[Math.max(0, remaining.findIndex(f => f.id === state.activeFormationId) - 1)].id : null;
    const newPerformerPositions = { ...state.performerPositions };
    const newPropPositions = { ...state.propPositions };
    const newPerformerPaths = { ...state.performerPaths };
    Object.keys(newPerformerPositions).forEach(k => { if (k.endsWith(`-${id}`)) delete newPerformerPositions[k]; });
    Object.keys(newPropPositions).forEach(k => { if (k.endsWith(`-${id}`)) delete newPropPositions[k]; });
    Object.keys(newPerformerPaths).forEach(k => { if (k.includes(`-${id}-`) || k.endsWith(`-${id}`)) delete newPerformerPaths[k]; });
    get().captureSnapshot();
    set({ formations: remaining, activeFormationId: newActive, performerPositions: newPerformerPositions, propPositions: newPropPositions, performerPaths: newPerformerPaths });
    (window as any).__spotlineBroadcastFormationDelete?.(id);
    get().pushHistory();
    if (isSupabaseConfigured()) await supabase.from('formations').delete().eq('id', id);
    scheduleAutoSave(get());
  },

  updateFormation: (id: string, updates: Partial<Formation>) => {
    get().captureSnapshot();
    set(s => ({
      formations: s.formations.map(f => {
        if (f.id !== id) return f;
        const merged = { ...f, ...updates };
        if (merged.duration < merged.transition_duration) merged.transition_duration = merged.duration;
        return merged;
      }),
    }));
    const updated = get().formations.find(f => f.id === id);
    if (updated) (window as any).__spotlineBroadcastFormationUpsert?.(updated);
    get().pushHistory();
    scheduleAutoSave(get());
  },

  reorderFormations: (sourceIndex: number, destIndex: number) => {
    const state = get();
    const reordered = [...state.formations];
    const [removed] = reordered.splice(sourceIndex, 1);
    reordered.splice(destIndex, 0, removed);
    const updated = reordered.map((f, i) => ({ ...f, order_index: i }));
    get().captureSnapshot();
    set({ formations: updated });
    (window as any).__spotlineBroadcastFormationsReorder?.(updated.map(f => ({ id: f.id, order_index: f.order_index })));
    get().pushHistory();
    scheduleAutoSave(get());
  },

  duplicateFormation: (id: string) => {
    const state = get();
    if (!state.show) return;
    const srcIdx = state.formations.findIndex(f => f.id === id);
    if (srcIdx === -1) return;
    const src = state.formations[srcIdx];
    const newId = uuidv4();
    const halfDuration = Math.max(0.3, src.duration / 2);

    const newFormation: Formation = {
      id: newId,
      show_id: state.show.id,
      name: src.name,
      notes: src.notes,
      duration: halfDuration,
      transition_duration: src.transition_duration,
      transition_easing: src.transition_easing,
      order_index: srcIdx + 1,
    };

    const newPerformerPositions = { ...state.performerPositions };
    state.performers.forEach(p => {
      const srcPos = state.performerPositions[`${p.id}-${id}`];
      newPerformerPositions[`${p.id}-${newId}`] = {
        id: uuidv4(),
        performer_id: p.id,
        formation_id: newId,
        x: srcPos?.x ?? state.show!.stage_config.width / 2,
        y: srcPos?.y ?? state.show!.stage_config.height / 2,
      };
    });

    const newPropPositions = { ...state.propPositions };
    state.props.forEach(p => {
      const srcPos = state.propPositions[`${p.id}-${id}`];
      newPropPositions[`${p.id}-${newId}`] = {
        id: uuidv4(),
        prop_id: p.id,
        formation_id: newId,
        x: srcPos?.x ?? state.show!.stage_config.width / 2,
        y: srcPos?.y ?? state.show!.stage_config.height / 2,
      };
    });

    const updatedFormations = state.formations.map(f =>
      f.id === id ? { ...f, duration: halfDuration } : f
    );
    updatedFormations.splice(srcIdx + 1, 0, newFormation);
    const reindexed = updatedFormations.map((f, i) => ({ ...f, order_index: i }));

    get().captureSnapshot();
    set({
      formations: reindexed,
      activeFormationId: newId,
      performerPositions: newPerformerPositions,
      propPositions: newPropPositions,
    });
    get().pushHistory();
    scheduleAutoSave(get());
  },

  setActiveFormation: (id: string, transitionDuration?: number) => {
    set({ activeFormationId: id, pendingTransitionDuration: transitionDuration ?? null });
  },

  setIsPlaying: (playing: boolean) => { set({ isPlaying: playing }); },
  setAnimationState: (fromId: string, progress: number) => {
    set({ isAnimating: true, animFromFormationId: fromId, rawAnimProgress: progress });
  },
  setRawAnimProgress: (p: number) => { set({ rawAnimProgress: p }); },
  endAnimation: () => { set({ isAnimating: false, animFromFormationId: null, rawAnimProgress: 0 }); },

  addPerformer: () => {
    const state = get();
    if (!state.show) return;
    const id = uuidv4();
    const colors = ['#1560ed', '#ed158c', '#ed1515', '#8015ed', '#15ee4c', '#ee7015', '#eec315', '#ffffff'];
    const color = colors[state.performers.length % colors.length];
    const shapes: Shape[] = ['circle', 'square', 'triangle', 'star'];
    const performer: Performer = {
      id,
      show_id: state.show.id,
      name: `P${state.performers.length + 1}`,
      color,
      shape: shapes[state.performers.length % shapes.length],
    };
    const cfg = state.show!.stage_config;
    const spawnX = (cfg.width / 8) * (state.performers.length % 8) + cfg.width / 16;
    const spawnY = -5;
    const newPositions = { ...state.performerPositions };
    state.formations.forEach(f => {
      const key = `${id}-${f.id}`;
      newPositions[key] = {
        id: uuidv4(),
        performer_id: id,
        formation_id: f.id,
        x: spawnX,
        y: spawnY,
      };
    });
    get().captureSnapshot();
    set(s => ({ performers: [...s.performers, performer], performerPositions: newPositions }));
    get().pushHistory();
    scheduleAutoSave(get());
  },

  deletePerformer: async (id: string) => {
    const state = get();
    const newPositions = { ...state.performerPositions };
    const newPaths = { ...state.performerPaths };
    Object.keys(newPositions).forEach(k => { if (k.startsWith(`${id}-`)) delete newPositions[k]; });
    Object.keys(newPaths).forEach(k => { if (k.startsWith(`${id}-`)) delete newPaths[k]; });
    get().captureSnapshot();
    set(s => ({
      performers: s.performers.filter(p => p.id !== id),
      performerPositions: newPositions,
      performerPaths: newPaths,
      selectedItem: s.selectedItem?.type === 'performer' && s.selectedItem.id === id ? null : s.selectedItem,
      selectedItemIds: s.selectedItemIds.filter(x => x !== id),
    }));
    get().pushHistory();
    if (isSupabaseConfigured()) await supabase.from('performers').delete().eq('id', id);
    scheduleAutoSave(get());
  },

  updatePerformer: (id: string, updates: Partial<Performer>) => {
    get().captureSnapshot();
    set(s => ({ performers: s.performers.map(p => p.id === id ? { ...p, ...updates } : p) }));
    get().pushHistory();
    scheduleAutoSave(get());
  },

  movePerformer: (performerId: string, formationId: string, x: number, y: number) => {
    const key = `${performerId}-${formationId}`;
    set(s => ({
      performerPositions: {
        ...s.performerPositions,
        [key]: { ...s.performerPositions[key], id: s.performerPositions[key]?.id || uuidv4(), performer_id: performerId, formation_id: formationId, x, y },
      },
    }));
    scheduleAutoSave(get());
  },

  bulkSetPerformerPositions: (formationId: string, updates: { id: string; x: number; y: number }[]) => {
    const state = get();
    const newPositions = { ...state.performerPositions };
    updates.forEach(({ id, x, y }) => {
      const key = `${id}-${formationId}`;
      if (newPositions[key]) {
        newPositions[key] = { ...newPositions[key], x, y };
      }
    });
    get().captureSnapshot();
    set({ performerPositions: newPositions });
    get().pushHistory();
    scheduleAutoSave(get());
  },

  addProp: () => {
    const state = get();
    if (!state.show) return;
    const id = uuidv4();
    const prop: Prop = {
      id,
      show_id: state.show.id,
      name: `Prop ${state.props.length + 1}`,
      color: colors.textMuted,
      shape: 'square',
      width: 2,
      depth: 2,
    };
    const cfg2 = state.show!.stage_config;
    const propSpawnX = (cfg2.width / 8) * (state.props.length % 8) + cfg2.width / 16;
    const propSpawnY = cfg2.height + 5;
    const newPositions = { ...state.propPositions };
    state.formations.forEach(f => {
      const key = `${id}-${f.id}`;
      newPositions[key] = {
        id: uuidv4(),
        prop_id: id,
        formation_id: f.id,
        x: propSpawnX,
        y: propSpawnY,
      };
    });
    get().captureSnapshot();
    set(s => ({ props: [...s.props, prop], propPositions: newPositions }));
    get().pushHistory();
    scheduleAutoSave(get());
  },

  deleteProp: async (id: string) => {
    const state = get();
    const newPositions = { ...state.propPositions };
    Object.keys(newPositions).forEach(k => { if (k.startsWith(`${id}-`)) delete newPositions[k]; });
    get().captureSnapshot();
    set(s => ({
      props: s.props.filter(p => p.id !== id),
      propPositions: newPositions,
      selectedItem: s.selectedItem?.type === 'prop' && s.selectedItem.id === id ? null : s.selectedItem,
      selectedItemIds: s.selectedItemIds.filter(x => x !== id),
    }));
    get().pushHistory();
    if (isSupabaseConfigured()) await supabase.from('props').delete().eq('id', id);
    scheduleAutoSave(get());
  },

  updateProp: (id: string, updates: Partial<Prop>) => {
    get().captureSnapshot();
    set(s => ({ props: s.props.map(p => p.id === id ? { ...p, ...updates } : p) }));
    get().pushHistory();
    scheduleAutoSave(get());
  },

  moveProp: (propId: string, formationId: string, x: number, y: number) => {
    const key = `${propId}-${formationId}`;
    set(s => ({
      propPositions: {
        ...s.propPositions,
        [key]: { ...s.propPositions[key], id: s.propPositions[key]?.id || uuidv4(), prop_id: propId, formation_id: formationId, x, y },
      },
    }));
    scheduleAutoSave(get());
  },

  nudgeSelected: (dx: number, dy: number) => {
    const state = get();
    if (!state.activeFormationId || !state.show || state.selectedItemIds.length === 0) return;
    const afId = state.activeFormationId;
    const newPerfPositions = { ...state.performerPositions };
    const newPropPositions = { ...state.propPositions };
    state.selectedItemIds.forEach(id => {
      const pk = `${id}-${afId}`;
      if (newPerfPositions[pk]) {
        newPerfPositions[pk] = { ...newPerfPositions[pk], x: newPerfPositions[pk].x + dx, y: newPerfPositions[pk].y + dy };
      }
      if (newPropPositions[pk]) {
        newPropPositions[pk] = { ...newPropPositions[pk], x: newPropPositions[pk].x + dx, y: newPropPositions[pk].y + dy };
      }
    });
    if (!nudgeHistoryTimeout) get().captureSnapshot();
    set({ performerPositions: newPerfPositions, propPositions: newPropPositions });
    if (nudgeHistoryTimeout) clearTimeout(nudgeHistoryTimeout);
    nudgeHistoryTimeout = setTimeout(() => { get().pushHistory(); nudgeHistoryTimeout = null; }, 400);
    scheduleAutoSave(get());
    const afterState = get();
    if (afterState.activeFormationId) {
      const afId = afterState.activeFormationId;
      const nudgeUpdates: { type: 'performer' | 'prop'; id: string; formationId: string; x: number; y: number }[] = [];
      afterState.selectedItemIds.forEach(id => {
        const perf = afterState.performerPositions[`${id}-${afId}`];
        if (perf) { nudgeUpdates.push({ type: 'performer', id, formationId: afId, x: perf.x, y: perf.y }); return; }
        const prop = afterState.propPositions[`${id}-${afId}`];
        if (prop) nudgeUpdates.push({ type: 'prop', id, formationId: afId, x: prop.x, y: prop.y });
      });
      if (nudgeUpdates.length > 0) (window as any).__spotlineBroadcastPositions?.(nudgeUpdates);
    }
  },

  setPerformerPath: (performerId: string, fromFormationId: string, toFormationId: string, cpDx: number, cpDy: number) => {
    const key = `${performerId}-${fromFormationId}-${toFormationId}`;
    set(s => ({ performerPaths: { ...s.performerPaths, [key]: { cpDx, cpDy } } }));
    if (isSupabaseConfigured()) {
      schedulePathSave(performerId, toFormationId, cpDx, cpDy);
    }
  },

  clearPerformerPath: (performerId: string, fromFormationId: string, toFormationId: string) => {
    const key = `${performerId}-${fromFormationId}-${toFormationId}`;
    set(s => {
      const newPaths = { ...s.performerPaths };
      delete newPaths[key];
      return { performerPaths: newPaths };
    });
    if (isSupabaseConfigured()) {
      supabase.from('performer_positions')
        .update({ cp_dx: 0, cp_dy: 0 })
        .eq('performer_id', performerId)
        .eq('formation_id', toFormationId)
        .then(() => {});
    }
  },

  optimizeFormationTransition: (fromFormationId: string, toFormationId: string) => {
    const state = get();
    const { performers, performerPositions, performerPaths } = state;
    const newPositions = { ...performerPositions };
    const newPaths = { ...performerPaths };

    // Bucket performers by group_id (ungrouped treated as their own pool)
    const buckets = new Map<string, typeof performers>();
    for (const p of performers) {
      const key = p.group_id ?? '__ungrouped__';
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(p);
    }

    for (const bucket of buckets.values()) {
      // Only include performers present in both formations
      const eligible = bucket.filter(p =>
        performerPositions[`${p.id}-${fromFormationId}`] &&
        performerPositions[`${p.id}-${toFormationId}`]
      );
      if (eligible.length < 2) continue;

      // cost[i][j] = squared distance — minimizing Σd² penalizes outliers quadratically,
      // producing more balanced travel distances than minimizing Σd
      const cost = eligible.map(pi => {
        const from = performerPositions[`${pi.id}-${fromFormationId}`];
        return eligible.map(pj => {
          const to = performerPositions[`${pj.id}-${toFormationId}`];
          const dx = from.x - to.x;
          const dy = from.y - to.y;
          return dx * dx + dy * dy;
        });
      });

      const assignment = hungarian(cost);

      // Greedy swap pass: reduce max travel distance without meaningfully increasing total.
      // Uses raw Euclidean (not d²) so swap decisions reflect actual visual movement.
      const rawDist = (pi: typeof eligible[0], pj: typeof eligible[0]) => {
        const from = performerPositions[`${pi.id}-${fromFormationId}`];
        const to   = performerPositions[`${pj.id}-${toFormationId}`];
        return Math.sqrt((from.x - to.x) ** 2 + (from.y - to.y) ** 2);
      };
      let improved = true;
      while (improved) {
        improved = false;
        for (let a = 0; a < eligible.length; a++) {
          for (let b = a + 1; b < eligible.length; b++) {
            const curDA  = rawDist(eligible[a], eligible[assignment[a]]);
            const curDB  = rawDist(eligible[b], eligible[assignment[b]]);
            const swapDA = rawDist(eligible[a], eligible[assignment[b]]);
            const swapDB = rawDist(eligible[b], eligible[assignment[a]]);
            if (Math.max(swapDA, swapDB) < Math.max(curDA, curDB) &&
                swapDA + swapDB <= (curDA + curDB) * 1.01) {
              [assignment[a], assignment[b]] = [assignment[b], assignment[a]];
              improved = true;
            }
          }
        }
      }

      // Snapshot to-positions before mutating
      const snapshot = eligible.map(p => ({ ...performerPositions[`${p.id}-${toFormationId}`] }));

      // Reassign: performer i gets the to-position originally held by performer assignment[i]
      for (let i = 0; i < eligible.length; i++) {
        const posKey = `${eligible[i].id}-${toFormationId}`;
        const src = snapshot[assignment[i]];
        newPositions[posKey] = { ...newPositions[posKey], x: src.x, y: src.y };
        // Stale paths must be cleared after reassignment
        delete newPaths[`${eligible[i].id}-${fromFormationId}-${toFormationId}`];
      }
    }

    get().captureSnapshot();
    set({ performerPositions: newPositions, performerPaths: newPaths });
    get().pushHistory();
    scheduleAutoSave(get());
  },

  arrangeSelectedPerformers: (shape: 'line-h' | 'line-v' | 'circle' | 'grid') => {
    const state = get();
    const { activeFormationId, selectedItemIds, performerPositions, propPositions, show } = state;
    if (!activeFormationId || selectedItemIds.length < 2 || !show) return;
    const getPos = (id: string) => performerPositions[`${id}-${activeFormationId}`] ?? propPositions[`${id}-${activeFormationId}`];
    const eligible = selectedItemIds.map(id => ({ id, pos: getPos(id) })).filter((x): x is { id: string; pos: typeof performerPositions[string] } => !!x.pos);
    if (eligible.length < 2) return;
    const n = eligible.length;
    const cfg = show.stage_config;
    const snapPos = (x: number, y: number) => {
      if (!cfg.snapToGrid) return { x, y };
      const sx = cfg.width / cfg.divisionsX / cfg.subdivisionsX;
      const sy = cfg.height / cfg.divisionsY / cfg.subdivisionsY;
      return { x: Math.round(x / sx) * sx, y: Math.round(y / sy) * sy };
    };
    const cx = eligible.reduce((s, x) => s + x.pos.x, 0) / n;
    const cy = eligible.reduce((s, x) => s + x.pos.y, 0) / n;
    const avgR = eligible.reduce((s, x) => s + Math.sqrt((x.pos.x - cx) ** 2 + (x.pos.y - cy) ** 2), 0) / n;
    const r = Math.max(5, avgR);
    const gap = n > 1 ? Math.min(cfg.width * 0.7 / (n - 1), 8) : 6;
    let targets: { x: number; y: number }[];
    switch (shape) {
      case 'line-h': targets = eligible.map((_, i) => snapPos(cx - (n - 1) / 2 * gap + i * gap, cy)); break;
      case 'line-v': targets = eligible.map((_, i) => snapPos(cx, cy - (n - 1) / 2 * gap + i * gap)); break;
      case 'circle': targets = eligible.map((_, i) => { const a = (i / n) * 2 * Math.PI - Math.PI / 2; return snapPos(cx + r * Math.cos(a), cy + r * Math.sin(a)); }); break;
      case 'grid': default: {
        const cols = Math.ceil(Math.sqrt(n));
        const rows = Math.ceil(n / cols);
        const gGap = Math.min(6, cfg.width * 0.1);
        targets = eligible.map((_, i) => snapPos(cx - (cols - 1) / 2 * gGap + (i % cols) * gGap, cy - (rows - 1) / 2 * gGap + Math.floor(i / cols) * gGap));
      }
    }
    const newPerfPositions = { ...performerPositions };
    const newPropPositions = { ...propPositions };
    eligible.forEach((item, i) => {
      const key = `${item.id}-${activeFormationId}`;
      if (newPerfPositions[key]) newPerfPositions[key] = { ...newPerfPositions[key], x: targets[i].x, y: targets[i].y };
      else if (newPropPositions[key]) newPropPositions[key] = { ...newPropPositions[key], x: targets[i].x, y: targets[i].y };
    });
    get().captureSnapshot();
    set({ performerPositions: newPerfPositions, propPositions: newPropPositions });
    get().pushHistory();
    scheduleAutoSave(get());
  },

  mirrorSelectedPerformers: (axis: 'horizontal' | 'vertical') => {
    const state = get();
    const { activeFormationId, selectedItemIds, performerPositions, propPositions, show } = state;
    if (!activeFormationId || selectedItemIds.length === 0 || !show) return;
    const cfg = show.stage_config;
    const { width, height } = cfg;
    const snapPos = (x: number, y: number) => {
      if (!cfg.snapToGrid) return { x, y };
      const sx = width / cfg.divisionsX / cfg.subdivisionsX;
      const sy = height / cfg.divisionsY / cfg.subdivisionsY;
      return { x: Math.round(x / sx) * sx, y: Math.round(y / sy) * sy };
    };
    const newPerfPositions = { ...performerPositions };
    const newPropPositions = { ...propPositions };
    selectedItemIds.forEach(id => {
      const key = `${id}-${activeFormationId}`;
      const pos = newPerfPositions[key] ?? newPropPositions[key];
      if (!pos) return;
      const raw = axis === 'horizontal' ? { x: width - pos.x, y: pos.y } : { x: pos.x, y: height - pos.y };
      const snapped = snapPos(raw.x, raw.y);
      if (newPerfPositions[key]) newPerfPositions[key] = { ...newPerfPositions[key], ...snapped };
      else newPropPositions[key] = { ...newPropPositions[key], ...snapped };
    });
    get().captureSnapshot();
    set({ performerPositions: newPerfPositions, propPositions: newPropPositions });
    get().pushHistory();
    scheduleAutoSave(get());
  },

  rotateSelectedPerformers: (degrees: 90 | 180 | 270) => {
    const state = get();
    const { activeFormationId, selectedItemIds, performerPositions, propPositions, show } = state;
    if (!activeFormationId || selectedItemIds.length === 0 || !show) return;
    const cfg = show.stage_config;
    const stageCx = cfg.width / 2;
    const stageCy = cfg.height / 2;
    const snapPos = (x: number, y: number) => {
      if (!cfg.snapToGrid) return { x, y };
      const sx = cfg.width / cfg.divisionsX / cfg.subdivisionsX;
      const sy = cfg.height / cfg.divisionsY / cfg.subdivisionsY;
      return { x: Math.round(x / sx) * sx, y: Math.round(y / sy) * sy };
    };
    const newPerfPositions = { ...performerPositions };
    const newPropPositions = { ...propPositions };
    selectedItemIds.forEach(id => {
      const key = `${id}-${activeFormationId}`;
      const pos = newPerfPositions[key] ?? newPropPositions[key];
      if (!pos) return;
      const dx = pos.x - stageCx;
      const dy = pos.y - stageCy;
      let nx: number, ny: number;
      if (degrees === 90)       { nx = stageCx - dy; ny = stageCy + dx; }
      else if (degrees === 270) { nx = stageCx + dy; ny = stageCy - dx; }
      else                      { nx = 2 * stageCx - pos.x; ny = 2 * stageCy - pos.y; }
      const snapped = snapPos(nx, ny);
      if (newPerfPositions[key]) newPerfPositions[key] = { ...newPerfPositions[key], ...snapped };
      else newPropPositions[key] = { ...newPropPositions[key], ...snapped };
    });
    get().captureSnapshot();
    set({ performerPositions: newPerfPositions, propPositions: newPropPositions });
    get().pushHistory();
    scheduleAutoSave(get());
  },

  setSelectedItem: (item: SelectableItem) => {
    set({ selectedItem: item });
  },

  setSelectedItemIds: (ids: string[]) => {
    const state = get();
    const item = resolveSelectedItem(state.performers, state.props, ids);
    set({ selectedItemIds: ids, selectedItem: item });
  },

  toggleItemSelected: (id: string) => {
    const state = get();
    const already = state.selectedItemIds.includes(id);
    const newIds = already ? state.selectedItemIds.filter(x => x !== id) : [...state.selectedItemIds, id];
    const item = resolveSelectedItem(state.performers, state.props, newIds);
    set({ selectedItemIds: newIds, selectedItem: item });
  },

  selectAllItems: () => {
    const state = get();
    const ids = [...state.performers.map(p => p.id), ...state.props.map(p => p.id)];
    set({ selectedItemIds: ids, selectedItem: null });
  },

  copySelectedPerformers: () => {
    const state = get();
    if (!state.activeFormationId) return;
    const sortedForms = state.formations.slice().sort((a, b) => a.order_index - b.order_index);
    const activeIdx = sortedForms.findIndex(f => f.id === state.activeFormationId);
    const nextFormationId = activeIdx < sortedForms.length - 1 ? sortedForms[activeIdx + 1].id : null;
    const items: SpotlineClipboardItem[] = [];
    state.selectedItemIds.forEach(id => {
      const performer = state.performers.find(p => p.id === id);
      if (performer) {
        const pos = state.performerPositions[`${id}-${state.activeFormationId}`];
        const departurePath = nextFormationId
          ? state.performerPaths[`${id}-${state.activeFormationId}-${nextFormationId}`]
          : undefined;
        if (pos) items.push({ type: 'performer', name: performer.name, color: performer.color, shape: performer.shape, x: pos.x, y: pos.y, departurePath });
        return;
      }
      const prop = state.props.find(p => p.id === id);
      if (prop) {
        const pos = state.propPositions[`${id}-${state.activeFormationId}`];
        if (pos) items.push({ type: 'prop', name: prop.name, color: prop.color, shape: prop.shape, size: prop.size ?? 2, x: pos.x, y: pos.y });
      }
    });
    _memClipboard = items;
    navigator.clipboard.writeText(JSON.stringify({ spotlineClipboard: true, version: 1, items })).catch(() => {});
  },

  pastePerformers: () => {
    (async () => {
      const state = get();
      if (!state.activeFormationId || !state.show) return;
      get().captureSnapshot();

      let items: SpotlineClipboardItem[] = [];
      try {
        const text = await navigator.clipboard.readText();
        const parsed = JSON.parse(text);
        if (parsed?.spotlineClipboard && Array.isArray(parsed.items)) {
          items = parsed.items;
        }
      } catch { /* permission denied or parse error */ }
      if (!items.length && _memClipboard) items = _memClipboard;
      if (!items.length) return;

      const freshState = get();
      const newPerformers: Performer[] = [];
      const newProps: Prop[] = [];
      const posUpdates: { type: 'performer' | 'prop'; id: string; x: number; y: number }[] = [];

      for (const item of items) {
        if (item.type === 'performer') {
          let p = freshState.performers.find(p => p.name.toLowerCase() === item.name.toLowerCase());
          if (!p) {
            p = { id: uuidv4(), show_id: freshState.show!.id, name: item.name, color: item.color, shape: item.shape, created_at: new Date().toISOString() };
            newPerformers.push(p);
          }
          posUpdates.push({ type: 'performer', id: p.id, x: item.x, y: item.y });
        } else {
          let pr = freshState.props.find(p => p.name.toLowerCase() === item.name.toLowerCase());
          if (!pr) {
            const s = item.size ?? 2;
            pr = { id: uuidv4(), show_id: freshState.show!.id, name: item.name, color: item.color, shape: item.shape, width: s, depth: s, created_at: new Date().toISOString() };
            newProps.push(pr);
          }
          posUpdates.push({ type: 'prop', id: pr!.id, x: item.x, y: item.y });
        }
      }

      const afId = freshState.activeFormationId!;
      const cfg = freshState.show!.stage_config;
      const newPerfPositions = { ...freshState.performerPositions };
      const newPropPositions = { ...freshState.propPositions };

      // Place newly created performers backstage in all formations except the paste target
      const allPerformerCountBase = freshState.performers.length;
      newPerformers.forEach((p, i) => {
        const spawnX = (cfg.width / 8) * ((allPerformerCountBase + i) % 8) + cfg.width / 16;
        const spawnY = -5;
        freshState.formations.forEach(f => {
          if (f.id === afId) return;
          const key = `${p.id}-${f.id}`;
          newPerfPositions[key] = { id: uuidv4(), performer_id: p.id, formation_id: f.id, x: spawnX, y: spawnY };
        });
      });

      posUpdates.forEach(({ type, id, x, y }) => {
        if (type === 'performer') {
          const key = `${id}-${afId}`;
          newPerfPositions[key] = { ...newPerfPositions[key], id: newPerfPositions[key]?.id || uuidv4(), performer_id: id, formation_id: afId, x, y };
        } else {
          const key = `${id}-${afId}`;
          newPropPositions[key] = { ...newPropPositions[key], id: newPropPositions[key]?.id || uuidv4(), prop_id: id, formation_id: afId, x, y };
        }
      });

      set(s => ({
        performers: [...s.performers, ...newPerformers],
        props: [...s.props, ...newProps],
        performerPositions: newPerfPositions,
        propPositions: newPropPositions,
      }));

      // Apply departure paths to the next formation if present in the clipboard
      const sortedForms = freshState.formations.slice().sort((a, b) => a.order_index - b.order_index);
      const activeIdx = sortedForms.findIndex(f => f.id === afId);
      const nextFormationId = activeIdx < sortedForms.length - 1 ? sortedForms[activeIdx + 1].id : null;
      if (nextFormationId) {
        const allPerformers = [...freshState.performers, ...newPerformers];
        for (const item of items) {
          if (item.type === 'performer' && item.departurePath) {
            const p = allPerformers.find(p => p.name.toLowerCase() === item.name.toLowerCase());
            if (p) get().setPerformerPath(p.id, afId, nextFormationId, item.departurePath.cpDx, item.departurePath.cpDy);
          }
        }
      }

      get().pushHistory();
      scheduleAutoSave(get());
    })();
  },

  addPerformerGroup: () => {
    const state = get();
    if (!state.show) return;
    const id = uuidv4();
    const group: PerformerGroup = {
      id,
      show_id: state.show.id,
      name: `Group ${state.performerGroups.length + 1}`,
      color: APP_COLORS[state.performerGroups.length % APP_COLORS.length],
    };
    get().captureSnapshot();
    set(s => ({ performerGroups: [...s.performerGroups, group] }));
    get().pushHistory();
    scheduleAutoSave(get());
  },

  deletePerformerGroup: async (id: string) => {
    get().captureSnapshot();
    set(s => ({
      performerGroups: s.performerGroups.filter(g => g.id !== id),
      performers: s.performers.map(p => p.group_id === id ? { ...p, group_id: undefined } : p),
    }));
    get().pushHistory();
    if (isSupabaseConfigured()) await supabase.from('performer_groups').delete().eq('id', id);
    scheduleAutoSave(get());
  },

  updatePerformerGroup: (id: string, updates: Partial<PerformerGroup>) => {
    set(s => ({ performerGroups: s.performerGroups.map(g => g.id === id ? { ...g, ...updates } : g) }));
    scheduleAutoSave(get());
  },

  assignPerformerToGroup: (performerId: string, groupId: string | null) => {
    get().captureSnapshot();
    set(s => ({
      performers: s.performers.map(p => p.id === performerId ? { ...p, group_id: groupId ?? undefined } : p),
    }));
    get().pushHistory();
    scheduleAutoSave(get());
  },

  setAudioVolume: (v: number) => {
    set({ audioVolume: v });
  },

  setAudioMuted: (m: boolean) => {
    set({ audioMuted: m });
  },

  addAudioSegment: () => {
    const state = get();
    if (!state.show) return;
    const SEGMENT_COLORS = APP_COLORS;
    const sorted = [...state.audioSegments].sort((a, b) => a.order_index - b.order_index);
    const newColor = SEGMENT_COLORS[sorted.length % SEGMENT_COLORS.length];

    const bpm = state.show.bpm;
    const beatDur = bpm && bpm > 0 ? 60 / bpm : 1;
    const defaultDuration = beatDur * 8;

    const selIdx = state.selectedAudioSegmentId
      ? sorted.findIndex(s => s.id === state.selectedAudioSegmentId)
      : -1;
    const isLastOrNone = selIdx < 0 || selIdx === sorted.length - 1;

    let insertAfterIdx = sorted.length - 1;
    let newDuration = defaultDuration;
    let updatedSorted = sorted;

    if (!isLastOrNone) {
      insertAfterIdx = selIdx;
      const sel = sorted[selIdx];
      if (sel.duration <= beatDur) {
        // Already at minimum — insert 1 beat, keep selected unchanged
        newDuration = beatDur;
      } else {
        // Split: selected gets half (beat-snapped), new gets remainder
        const half = Math.max(beatDur, Math.round(sel.duration / 2 / beatDur) * beatDur);
        newDuration = sel.duration - half;
        updatedSorted = sorted.map((s, i) => i === selIdx ? { ...s, duration: half } : s);
      }
    }

    const seg: AudioSegment = {
      id: uuidv4(),
      show_id: state.show.id,
      name: 'Segment',
      duration: newDuration,
      order_index: insertAfterIdx + 1,
      color: newColor,
    };

    const before = updatedSorted.slice(0, insertAfterIdx + 1);
    const after = updatedSorted.slice(insertAfterIdx + 1);
    const newSegments = [...before, seg, ...after].map((s, i) => ({ ...s, order_index: i }));

    set({ audioSegments: newSegments, selectedAudioSegmentId: seg.id });
    scheduleAutoSave(get());
  },

  updateAudioSegment: (id: string, changes: Partial<AudioSegment>) => {
    const { audioSegments } = get();
    set({ audioSegments: audioSegments.map(s => s.id === id ? { ...s, ...changes } : s) });
    scheduleAutoSave(get());
  },

  deleteAudioSegment: async (id: string) => {
    const { audioSegments, selectedAudioSegmentId } = get();
    const sorted = [...audioSegments].sort((a, b) => a.order_index - b.order_index);
    const idx = sorted.findIndex(s => s.id === id);
    const remaining = sorted.filter(s => s.id !== id).map((s, i) => ({ ...s, order_index: i }));
    let nextSelected = selectedAudioSegmentId;
    if (selectedAudioSegmentId === id) {
      nextSelected = (remaining[idx] ?? remaining[idx - 1] ?? null)?.id ?? null;
    }
    set({ audioSegments: remaining, selectedAudioSegmentId: nextSelected });
    if (isSupabaseConfigured()) await supabase.from('audio_segments').delete().eq('id', id);
    scheduleAutoSave(get());
  },

  setSelectedAudioSegment: (id: string | null) => {
    set({ selectedAudioSegmentId: id });
  },

  setViewMode: (mode: '2d' | '3d') => {
    set({ viewMode: mode });
  },

  captureSnapshot: () => {
    historyBaseline = snapshotState(get());
  },

  pushHistory: () => {
    if (!historyBaseline) return;
    const state = get();
    const postSnapshot = snapshotState(state);
    const forward = computePatch(historyBaseline, postSnapshot);
    const reverse = computePatch(postSnapshot, historyBaseline);
    historyBaseline = null;
    if (isPatchEmpty(forward) && isPatchEmpty(reverse)) return;
    const newHistory = state.history.slice(0, state.historyIndex + 1);
    newHistory.push({ forward, reverse });
    if (newHistory.length > MAX_HISTORY) newHistory.shift();
    set({ history: newHistory, historyIndex: newHistory.length - 1 });
  },

  undo: () => {
    const state = get();
    if (state.historyIndex < 0) return;
    const entry = state.history[state.historyIndex];
    const changes = sanitize(applyPatch(entry.reverse, state), state);
    set({ ...changes, historyIndex: state.historyIndex - 1 });
    broadcastHistoryChanges(state, changes);
    scheduleAutoSave(get());
  },

  redo: () => {
    const state = get();
    if (state.historyIndex >= state.history.length - 1) return;
    const nextEntry = state.history[state.historyIndex + 1];
    const changes = sanitize(applyPatch(nextEntry.forward, state), state);
    set({ ...changes, historyIndex: state.historyIndex + 1 });
    broadcastHistoryChanges(state, changes);
    scheduleAutoSave(get());
  },

  uploadMusic: async (file: File) => {
    const state = get();
    if (!state.show) return;
    if (isSupabaseConfigured()) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${state.show.id}/${safeName}`;
      const { error } = await supabase.storage.from('audio').upload(path, file, { upsert: true });
      if (error) throw new Error(error.message);
      const { data: signedData } = await supabase.storage.from('audio').createSignedUrl(path, 604800); // 7 days
      const playbackUrl = signedData?.signedUrl ?? '';
      // Store path for re-signing, use signed URL for immediate playback
      set(s => ({ show: s.show ? { ...s.show, music_url: playbackUrl, music_filename: file.name, music_storage_path: path } as any : null }));
    } else {
      const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      set(s => ({ show: s.show ? { ...s.show, music_url: url, music_filename: file.name } : null }));
    }
    scheduleAutoSave(get());
  },

  removeMusic: () => {
    const show = get().show;
    const storagePath = (show as any)?.music_storage_path as string | null | undefined;
    set(s => ({ show: s.show ? { ...s.show, music_url: null, music_filename: null, music_storage_path: null } as any : null }));
    if (isSupabaseConfigured() && show?.id) {
      supabase.from('shows').update({ music_url: null, music_filename: null, music_storage_path: null }).eq('id', show.id).then(() => {});
      if (storagePath) {
        supabase.storage.from('audio').remove([storagePath]).then(() => {});
      }
    }
    scheduleAutoSave(get());
  },

  addToast: (message, type = 'info') => {
    const id = uuidv4();
    set(s => ({ toasts: [...s.toasts, { id, message, type: type! }] }));
    setTimeout(() => {
      set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }));
    }, 4000);
  },

  removeToast: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),

  setRealtimeConnected: (connected) => set({ realtimeConnected: connected }),

  setCurrentUserRole: (role) => set({ currentUserRole: role }),

  persistAll: async () => {
    const state = get();
    if (!state.show) return;
    set({ isSaving: true });

    if (!isSupabaseConfigured()) {
      localStorage.setItem(`show-${state.show.id}`, JSON.stringify({
        show: state.show,
        formations: state.formations,
        performers: state.performers,
        props: state.props,
        performerPositions: state.performerPositions,
        propPositions: state.propPositions,
        performerPaths: state.performerPaths,
        performerGroups: state.performerGroups,
        audioSegments: state.audioSegments,
      }));
      setTimeout(() => set({ isSaving: false }), 300);
      return;
    }

    try {
      await supabase.from('shows').upsert({
        ...state.show,
        updated_at: new Date().toISOString(),
      });

      const pathByDest: Record<string, { cpDx: number; cpDy: number }> = {};
      Object.entries(state.performerPaths).forEach(([key, path]) => {
        // key = performerId-fromFormationId-toFormationId, each UUID is 36 chars
        // positions: 0-35 performerId, 36 '-', 37-72 fromFormationId, 73 '-', 74-109 toFormationId
        const performerId = key.substring(0, 36);
        const toFormationId = key.substring(74);
        pathByDest[`${performerId}-${toFormationId}`] = path;
      });
      const perfPositions = Object.entries(state.performerPositions).map(([key, pos]) => {
        const path = pathByDest[key];
        return { ...pos, cp_dx: path?.cpDx ?? 0, cp_dy: path?.cpDy ?? 0 };
      });

      await Promise.all([
        state.formations.length ? supabase.from('formations').upsert(state.formations) : Promise.resolve(),
        state.performers.length ? supabase.from('performers').upsert(state.performers) : Promise.resolve(),
        state.props.length ? supabase.from('props').upsert(state.props) : Promise.resolve(),
        perfPositions.length ? supabase.from('performer_positions').upsert(perfPositions, { onConflict: 'performer_id,formation_id' }) : Promise.resolve(),
        Object.keys(state.propPositions).length ? supabase.from('prop_positions').upsert(Object.values(state.propPositions), { onConflict: 'prop_id,formation_id' }) : Promise.resolve(),
        state.audioSegments.length ? supabase.from('audio_segments').upsert(state.audioSegments) : Promise.resolve(),
        state.performerGroups.length ? supabase.from('performer_groups').upsert(state.performerGroups) : Promise.resolve(),
      ]);
    } finally {
      set({ isSaving: false });
    }
  },
}));
