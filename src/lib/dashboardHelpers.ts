import { supabase, isSupabaseConfigured } from './supabase';
import type { ShowWithRole, ShowFolderWithRole } from './types';

export interface PreviewItem {
  color: string;
  shape: string;
  size: number;
  x: number;
  y: number;
}

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export async function fetchPreviewItems(showId: string): Promise<PreviewItem[]> {
  if (!isSupabaseConfigured()) {
    try {
      const data = JSON.parse(localStorage.getItem(`show-${showId}`) || 'null');
      if (!data) return [];
      const { formations = [], performers = [], props: propsList = [] } = data;
      const perfPositions: Record<string, any> = data.performerPositions || {};
      const propPositions: Record<string, any> = data.propPositions || {};
      const first = [...formations].sort((a: any, b: any) => a.order_index - b.order_index)[0];
      if (!first) return [];
      const items: PreviewItem[] = [];
      performers.forEach((p: any) => {
        const pos = perfPositions[`${p.id}-${first.id}`];
        if (pos) items.push({ color: p.color, shape: p.shape, size: 1, x: pos.x, y: pos.y });
      });
      propsList.forEach((p: any) => {
        const pos = propPositions[`${p.id}-${first.id}`];
        if (pos) items.push({ color: p.color, shape: p.shape, size: p.size ?? 2, x: pos.x, y: pos.y });
      });
      return items;
    } catch {
      return [];
    }
  }

  const { data: formations } = await supabase
    .from('formations')
    .select('id')
    .eq('show_id', showId)
    .order('order_index', { ascending: true })
    .limit(1);
  if (!formations?.length) return [];
  const formationId = formations[0].id;

  const [{ data: performers }, { data: perfPositions }, { data: propsList }, { data: propPositions }] = await Promise.all([
    supabase.from('performers').select('id, color, shape').eq('show_id', showId),
    supabase.from('performer_positions').select('performer_id, x, y').eq('formation_id', formationId),
    supabase.from('props').select('id, color, shape, size').eq('show_id', showId),
    supabase.from('prop_positions').select('prop_id, x, y').eq('formation_id', formationId),
  ]);

  const perfMap = new Map((performers || []).map((p: any) => [p.id, p]));
  const propMap = new Map((propsList || []).map((p: any) => [p.id, p]));
  const items: PreviewItem[] = [];
  (perfPositions || []).forEach((pp: any) => {
    const p = perfMap.get(pp.performer_id);
    if (p) items.push({ color: p.color, shape: p.shape, size: 1, x: pp.x, y: pp.y });
  });
  (propPositions || []).forEach((pp: any) => {
    const p = propMap.get(pp.prop_id);
    if (p) items.push({ color: p.color, shape: p.shape, size: p.size ?? 2, x: pp.x, y: pp.y });
  });
  return items;
}

export async function fetchShows(userId: string): Promise<ShowWithRole[]> {
  if (!isSupabaseConfigured() || !userId) {
    const localShows: ShowWithRole[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith('show-')) continue;
      try {
        const data = JSON.parse(localStorage.getItem(key)!);
        if (data?.show) localShows.push({ ...data.show, role: 'owner', member_count: 1 });
      } catch {}
    }
    return localShows;
  }

  const { data } = await supabase
    .from('show_members')
    .select('role, shows(*)')
    .eq('user_id', userId)
    .order('joined_at', { ascending: false });

  if (!data) return [];

  const showIds = data.map((m: any) => m.shows?.id).filter(Boolean);
  const { data: memberCounts } = await supabase
    .from('show_members')
    .select('show_id')
    .in('show_id', showIds);

  const countMap: Record<string, number> = {};
  (memberCounts || []).forEach((m: any) => {
    countMap[m.show_id] = (countMap[m.show_id] || 0) + 1;
  });

  return data
    .filter((m: any) => m.shows)
    .map((m: any) => ({
      ...m.shows,
      role: m.role,
      member_count: countMap[m.shows.id] || 1,
    }))
    .sort((a: ShowWithRole, b: ShowWithRole) =>
      new Date(b.updated_at || b.created_at || 0).getTime() -
      new Date(a.updated_at || a.created_at || 0).getTime()
    );
}

export async function fetchFolders(userId: string, knownFolderIds: string[] = []): Promise<ShowFolderWithRole[]> {
  if (!isSupabaseConfigured() || !userId) return [];

  // Fetch owned folders and folder memberships in parallel
  const [{ data: owned }, { data: memberships }] = await Promise.all([
    supabase.from('show_folders').select('*').eq('owner_id', userId),
    supabase.from('folder_members').select('folder_id, role').eq('user_id', userId),
  ]);

  const folderMap = new Map<string, ShowFolderWithRole>();
  (owned || []).forEach((f: any) => folderMap.set(f.id, { ...f, role: 'owner' as const }));

  // Collect all IDs to fetch: from folder_members + any folder_ids on shows (for show-level invites)
  const membershipMap = new Map<string, string>();
  (memberships || []).forEach((m: any) => membershipMap.set(m.folder_id, m.role));

  const idsToFetch = [...new Set([
    ...Array.from(membershipMap.keys()),
    ...knownFolderIds,
  ])].filter(id => !folderMap.has(id));

  if (idsToFetch.length > 0) {
    const { data: sharedFolders } = await supabase
      .from('show_folders')
      .select('*')
      .in('id', idsToFetch);

    (sharedFolders || []).forEach((f: any) => {
      const role = membershipMap.get(f.id) ?? 'viewer';
      folderMap.set(f.id, { ...f, role });
    });
  }

  return Array.from(folderMap.values()).sort(
    (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  );
}

export async function duplicateShow(showId: string, userId: string, sourceTitle: string): Promise<string | null> {
  const newShowId = crypto.randomUUID();

  const [
    { data: srcShow },
    { data: formations },
    { data: performers },
    { data: props },
    { data: audioSegments },
    { data: performerGroups },
  ] = await Promise.all([
    supabase.from('shows').select('*').eq('id', showId).single(),
    supabase.from('formations').select('*').eq('show_id', showId),
    supabase.from('performers').select('*').eq('show_id', showId),
    supabase.from('props').select('*').eq('show_id', showId),
    supabase.from('audio_segments').select('*').eq('show_id', showId),
    supabase.from('performer_groups').select('*').eq('show_id', showId),
  ]);

  if (!srcShow) return null;

  const formationIdMap: Record<string, string> = {};
  const performerIdMap: Record<string, string> = {};
  const propIdMap: Record<string, string> = {};
  const groupIdMap: Record<string, string> = {};

  (formations || []).forEach((f: any) => { formationIdMap[f.id] = crypto.randomUUID(); });
  (performers || []).forEach((p: any) => { performerIdMap[p.id] = crypto.randomUUID(); });
  (props || []).forEach((p: any) => { propIdMap[p.id] = crypto.randomUUID(); });
  (performerGroups || []).forEach((g: any) => { groupIdMap[g.id] = crypto.randomUUID(); });

  const formationIds = (formations || []).map((f: any) => f.id);
  const [{ data: perfPositions }, { data: propPositions }] = formationIds.length
    ? await Promise.all([
        supabase.from('performer_positions').select('*').in('formation_id', formationIds),
        supabase.from('prop_positions').select('*').in('formation_id', formationIds),
      ])
    : [{ data: [] }, { data: [] }];

  // Insert show and owner membership first so storage RLS (owner check) passes for the audio copy.
  // folder_id starts null so the caller's addShowToFolder() UPDATE is a real null -> folderId
  // change, which is what fires the auto_grant_folder_members trigger.
  const { error: showErr } = await supabase.from('shows').insert({
    ...srcShow,
    id: newShowId,
    title: `Copy of ${sourceTitle}`,
    owner_id: userId,
    folder_id: null,
    music_storage_path: null,
    music_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (showErr) return null;

  await supabase.from('show_members').insert({ show_id: newShowId, user_id: userId, role: 'owner' });

  const { data: srcMembers } = await supabase.from('show_members').select('user_id, role').eq('show_id', showId);
  const otherMembers = (srcMembers || []).filter((m: any) => m.user_id !== userId);
  if (otherMembers.length) {
    await supabase.from('show_members').insert(
      otherMembers.map((m: any) => ({ show_id: newShowId, user_id: m.user_id, role: m.role }))
    );
  }

  // Copy audio file to a new show-scoped path so deleting one show's audio doesn't affect the other
  const srcStoragePath = srcShow.music_storage_path as string | null | undefined;
  if (isSupabaseConfigured() && srcStoragePath) {
    try {
      const { data: signedData } = await supabase.storage.from('audio').createSignedUrl(srcStoragePath, 60);
      if (signedData?.signedUrl) {
        const res = await fetch(signedData.signedUrl);
        if (res.ok) {
          const blob = await res.blob();
          const filename = srcStoragePath.split('/').pop() ?? 'audio';
          const destPath = `${newShowId}/${filename}`;
          const { error: uploadErr } = await supabase.storage.from('audio').upload(destPath, blob, { upsert: true });
          if (!uploadErr) {
            const { data: newSigned } = await supabase.storage.from('audio').createSignedUrl(destPath, 604800);
            await supabase.from('shows').update({ music_storage_path: destPath, music_url: newSigned?.signedUrl ?? null, music_filename: srcShow.music_filename }).eq('id', newShowId);
          }
        }
      }
    } catch {}
  }

  const newGroups = (performerGroups || []).map((g: any) => ({ ...g, id: groupIdMap[g.id], show_id: newShowId }));
  const newFormations = (formations || []).map((f: any) => ({ ...f, id: formationIdMap[f.id], show_id: newShowId }));
  const newPerformers = (performers || []).map((p: any) => ({ ...p, id: performerIdMap[p.id], show_id: newShowId, group_id: p.group_id ? (groupIdMap[p.group_id] ?? null) : null }));
  const newProps = (props || []).map((p: any) => ({ ...p, id: propIdMap[p.id], show_id: newShowId }));
  const newSegments = (audioSegments || []).map((s: any) => ({ ...s, id: crypto.randomUUID(), show_id: newShowId }));

  // Insert groups first — performers.group_id is a FK referencing performer_groups
  if (newGroups.length) await supabase.from('performer_groups').insert(newGroups);

  await Promise.all([
    newFormations.length ? supabase.from('formations').insert(newFormations) : Promise.resolve(),
    newPerformers.length ? supabase.from('performers').insert(newPerformers) : Promise.resolve(),
    newProps.length ? supabase.from('props').insert(newProps) : Promise.resolve(),
    newSegments.length ? supabase.from('audio_segments').insert(newSegments) : Promise.resolve(),
  ]);

  const newPerfPositions = (perfPositions || []).map((pp: any) => ({
    ...pp,
    id: crypto.randomUUID(),
    performer_id: performerIdMap[pp.performer_id],
    formation_id: formationIdMap[pp.formation_id],
  }));
  const newPropPositions = (propPositions || []).map((pp: any) => ({
    ...pp,
    id: crypto.randomUUID(),
    prop_id: propIdMap[pp.prop_id],
    formation_id: formationIdMap[pp.formation_id],
  }));

  await Promise.all([
    newPerfPositions.length ? supabase.from('performer_positions').insert(newPerfPositions) : Promise.resolve(),
    newPropPositions.length ? supabase.from('prop_positions').insert(newPropPositions) : Promise.resolve(),
  ]);

  return newShowId;
}

export async function addShowToFolder(showId: string, folderId: string | null, _userId: string): Promise<void> {
  await supabase.from('shows').update({ folder_id: folderId }).eq('id', showId);
  // Member-granting is handled by the on_show_folder_change DB trigger
}
