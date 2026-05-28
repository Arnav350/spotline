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
  Shape,
  PerformerGroup,
  AudioSegment,
  ShowMemberRole,
} from '../lib/types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { hungarian } from '../lib/hungarian';
import { colorFromUserId, APP_COLORS } from '../lib/colors';


interface SpotlineClipboardItem {
  type: 'performer' | 'prop';
  name: string;
  color: string;
  shape: Shape;
  size?: number;
  x: number;
  y: number;
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
  duplicateFormation: (id: string) => void;
  deleteFormation: (id: string) => Promise<void>;
  updateFormation: (id: string, updates: Partial<Formation>) => void;
  reorderFormations: (sourceIndex: number, destIndex: number) => void;
  pendingTransitionDuration: number | null;
  setActiveFormation: (id: string, transitionDuration?: number) => void;

  addPerformer: () => void;
  deletePerformer: (id: string) => Promise<void>;
  updatePerformer: (id: string, updates: Partial<Performer>) => void;
  movePerformer: (performerId: string, formationId: string, x: number, y: number) => void;

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
  pushHistory: () => void;

  uploadMusic: (file: File) => Promise<void>;
  removeMusic: () => void;

  setCollaborators: (collaborators: CollaboratorState[]) => void;
  joinAsCollaborator: (name: string) => void;
  leaveAsCollaborator: () => void;
  addToast: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  removeToast: (id: string) => void;
  setRealtimeConnected: (connected: boolean) => void;
  setCurrentUserRole: (role: ShowMemberRole | null) => void;
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

function scheduleAutoSave(state: ShowState) {
  if (!state.show) return;
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    useShowStore.getState().persistAll();
  }, 800);
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
  localUserColor: '#7c3aed',
  currentUserRole: null,
  toasts: [],
  realtimeConnected: true,
  history: [],
  historyIndex: -1,
  isSaving: false,
  pendingTransitionDuration: null,

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
        get().pushHistory();
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

      const performerPositions: Record<string, PerformerPosition> = {};
      const performerPaths: Record<string, { cpDx: number; cpDy: number }> = {};
      (perfPositions || []).forEach(p => {
        performerPositions[`${p.performer_id}-${p.formation_id}`] = p;
        if (p.cp_dx || p.cp_dy) {
          performerPaths[`${p.performer_id}-${p.formation_id}`] = { cpDx: p.cp_dx ?? 0, cpDy: p.cp_dy ?? 0 };
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
      get().pushHistory();
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
    get().pushHistory();
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
    set(s => ({
      show: s.show ? { ...s.show, stage_config: { ...s.show.stage_config, ...config } } : null,
    }));
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
    set({ formations: remaining, activeFormationId: newActive, performerPositions: newPerformerPositions, propPositions: newPropPositions, performerPaths: newPerformerPaths });
    (window as any).__spotlineBroadcastFormationDelete?.(id);
    get().pushHistory();
    if (isSupabaseConfigured()) await supabase.from('formations').delete().eq('id', id);
    scheduleAutoSave(get());
  },

  updateFormation: (id: string, updates: Partial<Formation>) => {
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
    scheduleAutoSave(get());
  },

  reorderFormations: (sourceIndex: number, destIndex: number) => {
    const state = get();
    const reordered = [...state.formations];
    const [removed] = reordered.splice(sourceIndex, 1);
    reordered.splice(destIndex, 0, removed);
    const updated = reordered.map((f, i) => ({ ...f, order_index: i }));
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
    const newPositions = { ...state.performerPositions };
    state.formations.forEach(f => {
      const key = `${id}-${f.id}`;
      newPositions[key] = {
        id: uuidv4(),
        performer_id: id,
        formation_id: f.id,
        x: cfg.width / 2 + (Math.random() - 0.5) * 10,
        y: cfg.height / 2 + (Math.random() - 0.5) * 10,
      };
    });
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
    set(s => ({ performers: s.performers.map(p => p.id === id ? { ...p, ...updates } : p) }));
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

  addProp: () => {
    const state = get();
    if (!state.show) return;
    const id = uuidv4();
    const prop: Prop = {
      id,
      show_id: state.show.id,
      name: `Prop ${state.props.length + 1}`,
      color: '#888888',
      shape: 'square',
      width: 2,
      depth: 2,
    };
    const newPositions = { ...state.propPositions };
    state.formations.forEach(f => {
      const key = `${id}-${f.id}`;
      newPositions[key] = {
        id: uuidv4(),
        prop_id: id,
        formation_id: f.id,
        x: state.show!.stage_config.width / 2,
        y: state.show!.stage_config.height / 2,
      };
    });
    set(s => ({ props: [...s.props, prop], propPositions: newPositions }));
    get().pushHistory();
    scheduleAutoSave(get());
  },

  deleteProp: async (id: string) => {
    const state = get();
    const newPositions = { ...state.propPositions };
    Object.keys(newPositions).forEach(k => { if (k.startsWith(`${id}-`)) delete newPositions[k]; });
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
    set(s => ({ props: s.props.map(p => p.id === id ? { ...p, ...updates } : p) }));
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
    set({ performerPositions: newPerfPositions, propPositions: newPropPositions });
    get().pushHistory();
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
    scheduleAutoSave(get());
  },

  clearPerformerPath: (performerId: string, fromFormationId: string, toFormationId: string) => {
    const key = `${performerId}-${fromFormationId}-${toFormationId}`;
    set(s => {
      const newPaths = { ...s.performerPaths };
      delete newPaths[key];
      return { performerPaths: newPaths };
    });
    scheduleAutoSave(get());
  },

  optimizeFormationTransition: (fromFormationId: string, toFormationId: string) => {
    const state = get();
    get().pushHistory();

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

    set({ performerPositions: newPositions, performerPaths: newPaths });
    scheduleAutoSave(get());
  },

  arrangeSelectedPerformers: (shape: 'line-h' | 'line-v' | 'circle' | 'grid') => {
    const state = get();
    const { activeFormationId, selectedItemIds, performerPositions, propPositions, show } = state;
    if (!activeFormationId || selectedItemIds.length < 2 || !show) return;
    const getPos = (id: string) => performerPositions[`${id}-${activeFormationId}`] ?? propPositions[`${id}-${activeFormationId}`];
    const eligible = selectedItemIds.map(id => ({ id, pos: getPos(id) })).filter((x): x is { id: string; pos: typeof performerPositions[string] } => !!x.pos);
    if (eligible.length < 2) return;
    get().pushHistory();
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
    set({ performerPositions: newPerfPositions, propPositions: newPropPositions });
    scheduleAutoSave(get());
  },

  mirrorSelectedPerformers: (axis: 'horizontal' | 'vertical') => {
    const state = get();
    const { activeFormationId, selectedItemIds, performerPositions, propPositions, show } = state;
    if (!activeFormationId || selectedItemIds.length === 0 || !show) return;
    get().pushHistory();
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
    set({ performerPositions: newPerfPositions, propPositions: newPropPositions });
    scheduleAutoSave(get());
  },

  rotateSelectedPerformers: (degrees: 90 | 180 | 270) => {
    const state = get();
    const { activeFormationId, selectedItemIds, performerPositions, propPositions, show } = state;
    if (!activeFormationId || selectedItemIds.length === 0 || !show) return;
    get().pushHistory();
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
    set({ performerPositions: newPerfPositions, propPositions: newPropPositions });
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
    const items: SpotlineClipboardItem[] = [];
    state.selectedItemIds.forEach(id => {
      const performer = state.performers.find(p => p.id === id);
      if (performer) {
        const pos = state.performerPositions[`${id}-${state.activeFormationId}`];
        if (pos) items.push({ type: 'performer', name: performer.name, color: performer.color, shape: performer.shape, x: pos.x, y: pos.y });
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
      const newPerfPositions = { ...freshState.performerPositions };
      const newPropPositions = { ...freshState.propPositions };
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
    set(s => ({ performerGroups: [...s.performerGroups, group] }));
    scheduleAutoSave(get());
  },

  deletePerformerGroup: async (id: string) => {
    set(s => ({
      performerGroups: s.performerGroups.filter(g => g.id !== id),
      performers: s.performers.map(p => p.group_id === id ? { ...p, group_id: undefined } : p),
    }));
    if (isSupabaseConfigured()) await supabase.from('performer_groups').delete().eq('id', id);
    scheduleAutoSave(get());
  },

  updatePerformerGroup: (id: string, updates: Partial<PerformerGroup>) => {
    set(s => ({ performerGroups: s.performerGroups.map(g => g.id === id ? { ...g, ...updates } : g) }));
    scheduleAutoSave(get());
  },

  assignPerformerToGroup: (performerId: string, groupId: string | null) => {
    set(s => ({
      performers: s.performers.map(p => p.id === performerId ? { ...p, group_id: groupId ?? undefined } : p),
    }));
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

  pushHistory: () => {
    const state = get();
    const entry: HistoryEntry = {
      performers: JSON.parse(JSON.stringify(state.performers)),
      props: JSON.parse(JSON.stringify(state.props)),
      formations: JSON.parse(JSON.stringify(state.formations)),
      performerPositions: JSON.parse(JSON.stringify(state.performerPositions)),
      propPositions: JSON.parse(JSON.stringify(state.propPositions)),
      performerPaths: JSON.parse(JSON.stringify(state.performerPaths)),
    };
    const newHistory = state.history.slice(0, state.historyIndex + 1);
    newHistory.push(entry);
    if (newHistory.length > MAX_HISTORY) newHistory.shift();
    set({ history: newHistory, historyIndex: newHistory.length - 1 });
  },

  undo: () => {
    const state = get();
    if (state.historyIndex <= 0) return;
    const entry = state.history[state.historyIndex - 1];
    set({
      performers: entry.performers,
      props: entry.props,
      formations: entry.formations,
      performerPositions: entry.performerPositions,
      propPositions: entry.propPositions,
      performerPaths: entry.performerPaths ?? {},
      historyIndex: state.historyIndex - 1,
    });
    scheduleAutoSave(get());
  },

  redo: () => {
    const state = get();
    if (state.historyIndex >= state.history.length - 1) return;
    const entry = state.history[state.historyIndex + 1];
    set({
      performers: entry.performers,
      props: entry.props,
      formations: entry.formations,
      performerPositions: entry.performerPositions,
      propPositions: entry.propPositions,
      performerPaths: entry.performerPaths ?? {},
      historyIndex: state.historyIndex + 1,
    });
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
    const showId = get().show?.id;
    set(s => ({ show: s.show ? { ...s.show, music_url: null, music_filename: null, music_storage_path: null } as any : null }));
    if (isSupabaseConfigured() && showId) {
      supabase.from('shows').update({ music_url: null, music_filename: null, music_storage_path: null }).eq('id', showId).then(() => {});
    }
    scheduleAutoSave(get());
  },

  setCollaborators: (collaborators: CollaboratorState[]) => {
    set({ collaborators });
  },

  joinAsCollaborator: async (name: string) => {
    const state = get();
    if (!state.show || !isSupabaseConfigured()) return;
    const color = colorFromUserId(state.localUserId);
    set({ localUserName: name });
    await supabase.from('collaborators').upsert({
      show_id: state.show.id,
      user_id: state.localUserId,
      name,
      color,
      last_seen: new Date().toISOString(),
    }, { onConflict: 'show_id,user_id' });
  },

  leaveAsCollaborator: async () => {
    const state = get();
    if (!state.show || !isSupabaseConfigured()) return;
    await supabase.from('collaborators').delete().eq('show_id', state.show.id).eq('user_id', state.localUserId);
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

      const perfPositions = Object.entries(state.performerPositions).map(([key, pos]) => {
        const path = state.performerPaths[key];
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
