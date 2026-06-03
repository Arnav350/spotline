export type Shape = 'circle' | 'square' | 'triangle' | 'star';

export interface PerformerGroup {
  id: string;
  show_id: string;
  name: string;
  color: string;
}

export interface StageConfig {
  width: number;
  height: number;
  divisionsX: number;
  divisionsY: number;
  subdivisionsX: number;
  subdivisionsY: number;
  unit: string;
  snapToGrid?: boolean;
}

export interface Performer {
  id: string;
  show_id: string;
  name: string;
  color: string;
  shape: Shape;
  group_id?: string;
  created_at?: string;
}

export interface Prop {
  id: string;
  show_id: string;
  name: string;
  color: string;
  shape: Shape;
  width: number;
  depth: number;
  size?: number;  // legacy — kept for backwards compat with existing DB rows
  created_at?: string;
}

export type TransitionEasing = 'linear' | 'ease' | 'ease-in' | 'ease-out';

export interface Formation {
  id: string;
  show_id: string;
  name: string;
  notes: string;
  duration: number;
  transition_duration: number;
  transition_easing?: TransitionEasing;
  order_index: number;
  created_at?: string;
}

export interface PerformerPosition {
  id: string;
  performer_id: string;
  formation_id: string;
  x: number;
  y: number;
  cp_dx?: number;
  cp_dy?: number;
}

export interface PropPosition {
  id: string;
  prop_id: string;
  formation_id: string;
  x: number;
  y: number;
}

export interface Show {
  id: string;
  title: string;
  stage_config: StageConfig;
  music_url: string | null;
  music_filename: string | null;
  bpm?: number;
  folder_id?: string | null;
  created_at?: string;
  updated_at?: string;
}


export type SelectableItem =
  | { type: 'performer'; id: string }
  | { type: 'prop'; id: string }
  | null;

export interface AudioSegment {
  id: string;
  show_id: string;
  name: string;
  duration: number;
  order_index: number;
  color: string;
}

export interface HistorySnapshot {
  performers: Performer[];
  props: Prop[];
  formations: Formation[];
  performerPositions: Record<string, PerformerPosition>;
  propPositions: Record<string, PropPosition>;
  performerPaths: Record<string, { cpDx: number; cpDy: number }>;
  performerGroups: PerformerGroup[];
}

export interface HistoryEntry extends HistorySnapshot {
  // State before this action was applied — used for delta-based undo that preserves remote changes.
  before?: HistorySnapshot;
}

export interface Profile {
  id: string;
  display_name: string;
  created_at?: string;
}

export type ShowMemberRole = 'owner' | 'editor' | 'viewer';

export interface ShowMember {
  id: string;
  show_id: string;
  user_id: string;
  role: ShowMemberRole;
  joined_at?: string;
  profile?: Profile;
}

export interface Invitation {
  id: string;
  show_id?: string | null;
  folder_id?: string | null;
  inviter_id: string;
  invitee_email: string;
  token: string;
  role: 'editor' | 'viewer';
  status: 'pending' | 'accepted' | 'revoked';
  expires_at: string;
  created_at?: string;
}

export interface ShowWithRole extends Show {
  role: ShowMemberRole;
  member_count?: number;
}

export interface ShowFolder {
  id: string;
  owner_id: string;
  title: string;
  created_at?: string;
}

export interface ShowFolderWithRole extends ShowFolder {
  role: ShowMemberRole;
  member_count?: number;
  show_count?: number;
}

export interface ShowPublicLink {
  id: string;
  show_id: string;
  token: string;
  enabled: boolean;
  created_at: string;
}
