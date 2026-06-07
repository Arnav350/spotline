import React, { useEffect, useState, useRef } from 'react';
import { Plus, MoreHorizontal, Trash2, LogOut, Users, Clock, FolderPlus, Folder, FolderOpen, ChevronRight } from 'lucide-react';
import { useShowStore } from '../store/showStore';
import { useAuthStore } from '../store/authStore';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { colors, fontSize, fontWeight, radius, spacing } from '../lib/theme';
import type { ShowWithRole, ShowFolderWithRole } from '../lib/types';
import { timeAgo, fetchPreviewItems, fetchShows, fetchFolders, addShowToFolder, duplicateShow, type PreviewItem } from '../lib/dashboardHelpers';
import InviteModal from './InviteModal';

// --- StagePreview ---

function StagePreview({ show, items }: { show: ShowWithRole; items: PreviewItem[] }) {
  const VW = 160, VH = 90, PAD = 6;
  const sc = show.stage_config || { width: 60, height: 40, divisionsX: 5, divisionsY: 5 };
  const stageAspect = sc.width / sc.height;
  const availW = VW - PAD * 2, availH = VH - PAD * 2;
  let stageW: number, stageH: number;
  if (availW / availH > stageAspect) {
    stageH = availH; stageW = stageH * stageAspect;
  } else {
    stageW = availW; stageH = stageW / stageAspect;
  }
  const stageX = (VW - stageW) / 2;
  const stageY = (VH - stageH) / 2;
  const divX = sc.divisionsX || 5;
  const divY = sc.divisionsY || 5;

  function toSVG(wx: number, wy: number) {
    return { x: stageX + (wx / sc.width) * stageW, y: stageY + (wy / sc.height) * stageH };
  }

  const gridLines: React.ReactNode[] = [];
  for (let i = 1; i < divX; i++) {
    const x = stageX + (i / divX) * stageW;
    gridLines.push(<line key={`v${i}`} x1={x} y1={stageY} x2={x} y2={stageY + stageH} stroke="rgba(255,255,255,0.07)" strokeWidth={0.5} />);
  }
  for (let i = 1; i < divY; i++) {
    const y = stageY + (i / divY) * stageH;
    gridLines.push(<line key={`h${i}`} x1={stageX} y1={y} x2={stageX + stageW} y2={y} stroke="rgba(255,255,255,0.07)" strokeWidth={0.5} />);
  }

  const dotR = Math.max(1.8, Math.min(3.5, stageW / 22));
  const dots = items.map((item, i) => {
    const { x, y } = toSVG(item.x, item.y);
    if (item.shape === 'circle') {
      return <circle key={i} cx={x} cy={y} r={dotR} fill={item.color} opacity={0.92} />;
    } else if (item.shape === 'square') {
      return <rect key={i} x={x - dotR} y={y - dotR} width={dotR * 2} height={dotR * 2} fill={item.color} opacity={0.92} />;
    } else if (item.shape === 'triangle') {
      return <polygon key={i} points={`${x},${y - dotR} ${x - dotR},${y + dotR} ${x + dotR},${y + dotR}`} fill={item.color} opacity={0.92} />;
    } else {
      return <circle key={i} cx={x} cy={y} r={dotR * 0.85} fill={item.color} opacity={0.92} />;
    }
  });

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} style={{ width: '100%', height: '100%', display: 'block' }}>
      <rect x={stageX} y={stageY} width={stageW} height={stageH} fill={colors.bg} stroke={`${colors.accent}59`} strokeWidth={0.75} />
      {gridLines}
      {dots}
      {items.length === 0 && (
        <text x={VW / 2} y={VH / 2} textAnchor="middle" dominantBaseline="middle" fontSize={7} fill="rgba(255,255,255,0.12)" fontFamily="Inter, sans-serif">
          No formations
        </text>
      )}
    </svg>
  );
}

// --- ProjectCard ---

interface ProjectCardProps {
  show: ShowWithRole;
  folders: ShowFolderWithRole[];
  onOpen: () => void;
  onDelete: () => void;
  onLeave: () => void;
  onRename: (title: string) => void;
  onMoveToFolder: (folderId: string | null) => void;
  onDuplicate: () => void;
}

function ProjectCard({ show, folders, onOpen, onDelete, onLeave, onRename, onMoveToFolder, onDuplicate }: ProjectCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState(show.title);
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([]);
  const [movingToFolder, setMovingToFolder] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchPreviewItems(show.id).then(setPreviewItems);
  }, [show.id]);

  useEffect(() => {
    if (!menuOpen) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  useEffect(() => {
    if (renaming) setTimeout(() => inputRef.current?.select(), 10);
  }, [renaming]);

  function commitRename() {
    const t = titleDraft.trim();
    if (t && t !== show.title) onRename(t);
    setRenaming(false);
  }

  const isOwner = show.role === 'owner';
  const roleColor = show.role === 'owner' ? colors.accent : show.role === 'editor' ? colors.success : colors.textSecondary;
  const ownedFolders = folders.filter(f => f.role === 'owner');

  return (
    <div
      onClick={(e) => {
        if (e.ctrlKey || e.metaKey) window.open(`/?show=${show.id}`, '_blank');
        else onOpen();
      }}
      style={{
        background: colors.bgCard, border: `1px solid ${colors.border}`,
        borderRadius: radius.md, padding: spacing.xl, cursor: 'pointer',
        transition: 'border-color 0.15s, background 0.15s', position: 'relative',
        display: 'flex', flexDirection: 'column', gap: spacing.sm, userSelect: 'none',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = colors.borderMed; (e.currentTarget as HTMLElement).style.background = colors.bgCardHover; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = colors.border; (e.currentTarget as HTMLElement).style.background = colors.bgCard; }}
    >
      <div style={{ width: '100%', aspectRatio: '16/9', background: colors.bg, borderRadius: radius.sm, border: `1px solid ${colors.borderSubtle}`, overflow: 'hidden' }}>
        <StagePreview show={show} items={previewItems} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
        {renaming ? (
          <input
            ref={inputRef}
            style={{ flex: 1, background: 'transparent', border: 'none', borderBottom: `1px solid ${colors.accent}`, outline: 'none', fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text, padding: `${spacing.xxs}px 0` }}
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(false); }}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span style={{ flex: 1, fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {show.title || 'Untitled Show'}
          </span>
        )}
        <span style={{ fontSize: fontSize.sm, color: roleColor, border: `1px solid ${roleColor}`, borderRadius: radius.sm, padding: `1px ${spacing.xs}px`, flexShrink: 0, opacity: 0.8 }}>
          {show.role}
        </span>
        <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <button className="btn-icon" style={{ width: 28, height: 28 }} onClick={() => { setMenuOpen(v => !v); setMovingToFolder(false); }}>
            <MoreHorizontal size={14} />
          </button>
          {menuOpen && (
            <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 50, background: colors.bgPanel, border: `1px solid ${colors.borderMed}`, borderRadius: radius.sm, overflow: 'hidden', minWidth: 160, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
              {!movingToFolder ? (
                <>
                  {isOwner && (
                    <button className="menu-item" onClick={() => { setRenaming(true); setMenuOpen(false); }}>Rename</button>
                  )}
                  {(isOwner || show.role === 'editor') && (
                    <button className="menu-item" onClick={() => { onDuplicate(); setMenuOpen(false); }}>Duplicate</button>
                  )}
                  {isOwner && ownedFolders.length > 0 && (
                    <button className="menu-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                      onClick={() => setMovingToFolder(true)}>
                      Move to folder <ChevronRight size={12} />
                    </button>
                  )}
                  {!isOwner && (
                    <button className="menu-item" onClick={() => { onLeave(); setMenuOpen(false); }}>
                      <LogOut size={13} /> Leave
                    </button>
                  )}
                  {isOwner && (
                    <button className="menu-item danger" onClick={() => { onDelete(); setMenuOpen(false); }}>
                      <Trash2 size={13} /> Delete
                    </button>
                  )}
                </>
              ) : (
                <>
                  <div style={{ padding: `${spacing.sm}px ${spacing.md}px ${spacing.xs}px`, fontSize: fontSize.sm, color: colors.textFaint, borderBottom: `1px solid ${colors.border}` }}>Move to folder</div>
                  {show.folder_id && (
                    <button className="menu-item" onClick={() => { onMoveToFolder(null); setMenuOpen(false); }}>
                      Remove from folder
                    </button>
                  )}
                  {ownedFolders.filter(f => f.id !== show.folder_id).map(f => (
                    <button key={f.id} className="menu-item" onClick={() => { onMoveToFolder(f.id); setMenuOpen(false); }}>
                      <Folder size={12} /> {f.title}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md, fontSize: fontSize.sm, color: colors.textMuted }}>
        {show.updated_at && (
          <span style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}><Clock size={11} />{timeAgo(show.updated_at)}</span>
        )}
        {(show.member_count ?? 0) > 1 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}><Users size={11} />{show.member_count} members</span>
        )}
      </div>
    </div>
  );
}

// --- SidebarItem ---

interface SidebarItemProps {
  label: string;
  count: number;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  onRename?: (title: string) => void;
  onDelete?: () => void;
  onShare?: () => void;
  isOwner?: boolean;
}

function SidebarItem({ label, count, icon, active, onClick, onRename, onDelete, onShare, isOwner }: SidebarItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(label);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasMenu = !!(onRename || onDelete || onShare);

  useEffect(() => { setDraft(label); }, [label]);

  useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [menuOpen]);

  useEffect(() => {
    if (renaming) setTimeout(() => inputRef.current?.select(), 10);
  }, [renaming]);

  function commitRename() {
    const t = draft.trim();
    if (t && t !== label) onRename?.(t);
    setRenaming(false);
  }

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: spacing.sm,
        padding: `${spacing.xs}px ${spacing.md}px`, borderRadius: radius.sm, cursor: 'pointer',
        background: active ? `${colors.accent}22` : 'transparent',
        border: `1px solid ${active ? `${colors.accent}55` : 'transparent'}`,
        transition: 'background 0.12s',
        userSelect: 'none',
      }}
      onClick={onClick}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = colors.bgCard; }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      <span style={{ flexShrink: 0, color: active ? colors.accent : colors.textFaint, display: 'flex', alignItems: 'center' }}>{icon}</span>
      {renaming ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={e => {
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') setRenaming(false);
            e.stopPropagation();
          }}
          onClick={e => e.stopPropagation()}
          style={{ flex: 1, background: 'transparent', border: 'none', borderBottom: `1px solid ${colors.accent}`, outline: 'none', fontSize: fontSize.md, color: colors.text, padding: '0 1px', minWidth: 0, fontFamily: 'inherit' }}
        />
      ) : (
        <span style={{ flex: 1, fontSize: fontSize.md, color: active ? colors.text : colors.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </span>
      )}
      <span style={{ fontSize: fontSize.md, color: colors.textGhost, flexShrink: 0 }}>{count}</span>
      {hasMenu && (
        <div style={{ position: 'relative', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <button
            ref={btnRef}
            className="btn-icon"
            style={{ width: 24, height: 24 }}
            onClick={() => {
              if (!menuOpen && btnRef.current) {
                const r = btnRef.current.getBoundingClientRect();
                setMenuPos({ x: r.left, y: r.bottom + 4 });
              }
              setMenuOpen(v => !v);
            }}
          >
            <MoreHorizontal size={20} />
          </button>
          {menuOpen && (
            <div ref={menuRef} style={{ position: 'fixed', left: menuPos.x, top: menuPos.y, zIndex: 1000, background: colors.bgPanel, border: `1px solid ${colors.borderMed}`, borderRadius: radius.sm, overflow: 'hidden', minWidth: 140, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
              {isOwner && onRename && <button className="menu-item" onClick={() => { setRenaming(true); setMenuOpen(false); }}>Rename</button>}
              {isOwner && onShare && <button className="menu-item" onClick={() => { onShare(); setMenuOpen(false); }}>Share folder</button>}
              {isOwner && onDelete && <button className="menu-item danger" onClick={() => { onDelete(); setMenuOpen(false); }}>Delete folder</button>}
              {!isOwner && <span style={{ padding: '8px 12px', fontSize: fontSize.sm, color: colors.textFaint, display: 'block' }}>Shared with you</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Dashboard ---

interface DashboardProps {
  onOpenShow: (showId: string) => void;
}

type SelectedView = 'all' | 'unfiled' | string; // string = folder id

export default function Dashboard({ onOpenShow }: DashboardProps) {
  const { createShow } = useShowStore();
  const { user, profile, signOut } = useAuthStore();
  const [shows, setShows] = useState<ShowWithRole[]>([]);
  const [folders, setFolders] = useState<ShowFolderWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [shareFolder, setShareFolder] = useState<ShowFolderWithRole | null>(null);
  const [selectedView, setSelectedView] = useState<SelectedView>('all');
  const hasLoadedOnce = React.useRef(false);

  useEffect(() => { loadAll(); }, [user]);

  async function loadAll() {
    if (!hasLoadedOnce.current) setLoading(true);
    // Fetch shows first, then pass their folder_ids so fetchFolders can pick up
    // folders the user can see via show membership (not just folder_members)
    const showList = await fetchShows(user?.id || '');
    const knownFolderIds = [...new Set(showList.map(s => s.folder_id).filter(Boolean) as string[])];
    const folderList = await fetchFolders(user?.id || '', knownFolderIds);
    setShows(showList);
    setFolders(folderList);
    hasLoadedOnce.current = true;
    setLoading(false);
  }

  async function handleCreate() {
    const folderId = typeof selectedView === 'string' && selectedView !== 'all' && selectedView !== 'unfiled'
      ? selectedView
      : null;
    const id = await createShow();
    if (folderId && isSupabaseConfigured()) {
      await addShowToFolder(id, folderId, user?.id || '');
      setShows(prev => prev.map(s => s.id === id ? { ...s, folder_id: folderId } : s));
    }
    window.history.pushState({}, '', `/?show=${id}`);
    onOpenShow(id);
  }

  async function handleCreateFolder() {
    if (!user || !isSupabaseConfigured()) return;
    const { data } = await supabase
      .from('show_folders')
      .insert({ owner_id: user.id, title: 'New Folder' })
      .select()
      .single();
    if (data) {
      await supabase.from('folder_members').insert({ folder_id: data.id, user_id: user.id, role: 'owner' });
      const newFolder = { ...data, role: 'owner' as const };
      setFolders(prev => [...prev, newFolder]);
      setSelectedView(data.id);
    }
  }

  async function handleDeleteFolder(folderId: string) {
    if (!confirm('Delete this folder? Shows inside will not be deleted but will be unfiled.')) return;
    await supabase.from('show_folders').delete().eq('id', folderId);
    setFolders(prev => prev.filter(f => f.id !== folderId));
    setShows(prev => prev.map(s => s.folder_id === folderId ? { ...s, folder_id: null } : s));
    if (selectedView === folderId) setSelectedView('all');
  }

  async function handleRenameFolder(folderId: string, title: string) {
    await supabase.from('show_folders').update({ title }).eq('id', folderId);
    setFolders(prev => prev.map(f => f.id === folderId ? { ...f, title } : f));
  }

  async function handleDelete(showId: string) {
    if (!confirm('Delete this show permanently? This cannot be undone.')) return;
    if (isSupabaseConfigured()) {
      const { data: files } = await supabase.storage.from('audio').list(showId);
      if (files && files.length > 0) {
        await supabase.storage.from('audio').remove(files.map(f => `${showId}/${f.name}`));
      }
      await supabase.from('shows').delete().eq('id', showId);
    } else {
      localStorage.removeItem(`show-${showId}`);
    }
    setShows(prev => prev.filter(s => s.id !== showId));
  }

  async function handleLeave(showId: string) {
    if (!user) return;
    if (!confirm('Leave this show? You will lose access unless re-invited.')) return;
    await supabase.from('show_members').delete().eq('show_id', showId).eq('user_id', user.id);
    setShows(prev => prev.filter(s => s.id !== showId));
  }

  async function handleRename(showId: string, title: string) {
    if (isSupabaseConfigured()) {
      await supabase.from('shows').update({ title }).eq('id', showId);
    } else {
      const key = `show-${showId}`;
      const data = JSON.parse(localStorage.getItem(key) || '{}');
      if (data.show) { data.show.title = title; localStorage.setItem(key, JSON.stringify(data)); }
    }
    setShows(prev => prev.map(s => s.id === showId ? { ...s, title } : s));
  }

  async function handleMoveToFolder(showId: string, folderId: string | null) {
    await addShowToFolder(showId, folderId, user?.id || '');
    setShows(prev => prev.map(s => s.id === showId ? { ...s, folder_id: folderId } : s));
  }

  async function handleDuplicate(showId: string) {
    if (!user || !isSupabaseConfigured()) return;
    const src = shows.find(s => s.id === showId);
    if (!src) return;
    const targetFolderId = src.folder_id ?? null;
    const newId = await duplicateShow(showId, user.id, src.title, targetFolderId);
    if (!newId) return;
    if (targetFolderId) await addShowToFolder(newId, targetFolderId, user.id);
    await loadAll();
  }

  const unfiledShows = shows.filter(s => !s.folder_id);

  const visibleShows = selectedView === 'all'
    ? shows
    : selectedView === 'unfiled'
    ? unfiledShows
    : shows.filter(s => s.folder_id === selectedView);

  const selectedFolder = typeof selectedView === 'string' && selectedView !== 'all' && selectedView !== 'unfiled'
    ? folders.find(f => f.id === selectedView)
    : null;

  const sectionTitle = selectedView === 'all'
    ? 'All Shows'
    : selectedView === 'unfiled'
    ? 'Unfiled'
    : selectedFolder?.title ?? 'Folder';

  return (
    <div style={{ height: '100vh', background: colors.bg, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {shareFolder && (
        <InviteModal
          folderId={shareFolder.id}
          folderTitle={shareFolder.title}
          onClose={() => setShareFolder(null)}
        />
      )}

      {/* Top bar */}
      <div style={{ height: 52, padding: `0 ${spacing.xl}px`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${colors.border}`, background: colors.bgPanel, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
          <div style={{ width: 24, height: 24, borderRadius: radius.sm, background: colors.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 9, height: 9, borderRadius: radius.xs, background: 'rgba(255,255,255,0.9)' }} />
          </div>
          <span style={{ fontSize: fontSize.md, fontWeight: fontWeight.bold, letterSpacing: '0.12em', color: colors.text, textTransform: 'uppercase' }}>SPOTLINE</span>
        </div>
        {profile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: colors.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.text }}>
                {profile.display_name.slice(0, 2).toUpperCase()}
              </div>
              <span style={{ fontSize: fontSize.md, color: colors.textSecondary }}>{profile.display_name}</span>
            </div>
            <button className="btn-ghost" style={{ fontSize: fontSize.md, padding: `${spacing.xs}px ${spacing.md}px` }} onClick={signOut}>Sign out</button>
          </div>
        )}
      </div>

      {/* Body: sidebar + content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Sidebar */}
        <div style={{
          width: 220, flexShrink: 0,
          background: colors.bgPanel, borderRight: `1px solid ${colors.border}`,
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: `${spacing.lg}px ${spacing.md}px ${spacing.sm}px` }}>
            {/* All Shows */}
            <SidebarItem
              label="All Shows"
              count={shows.length}
              icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>}
              active={selectedView === 'all'}
              onClick={() => setSelectedView('all')}
            />

            {/* Unfiled — only show if there are unfiled shows */}
            {(unfiledShows.length > 0 || selectedView === 'unfiled') && (
              <div style={{ marginTop: 2 }}>
                <SidebarItem
                  label="Unfiled"
                  count={unfiledShows.length}
                  icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>}
                  active={selectedView === 'unfiled'}
                  onClick={() => setSelectedView('unfiled')}
                />
              </div>
            )}

            {/* Folders */}
            {folders.length > 0 && (
              <div style={{ marginTop: spacing.md }}>
                <div style={{ fontSize: fontSize.sm, color: colors.textGhost, textTransform: 'uppercase', letterSpacing: '0.06em', padding: `0 ${spacing.md}px`, marginBottom: spacing.xs }}>
                  Folders
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xxs }}>
                  {folders.map(folder => (
                    <SidebarItem
                      key={folder.id}
                      label={folder.title}
                      count={shows.filter(s => s.folder_id === folder.id).length}
                      icon={selectedView === folder.id
                        ? <FolderOpen size={14} />
                        : <Folder size={14} />}
                      active={selectedView === folder.id}
                      onClick={() => setSelectedView(folder.id)}
                      onRename={title => handleRenameFolder(folder.id, title)}
                      onDelete={() => handleDeleteFolder(folder.id)}
                      onShare={() => setShareFolder(folder)}
                      isOwner={folder.role === 'owner'}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* New folder button */}
          {isSupabaseConfigured() && (
            <div style={{ padding: `${spacing.sm}px ${spacing.md}px`, borderTop: `1px solid ${colors.border}` }}>
              <button
                onClick={handleCreateFolder}
                style={{
                  display: 'flex', alignItems: 'center', gap: spacing.sm, width: '100%',
                  padding: `${spacing.sm}px ${spacing.md}px`, fontSize: fontSize.md, color: colors.textMuted,
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  borderRadius: radius.sm, transition: 'color 0.12s, background 0.12s',
                  textAlign: 'left',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = colors.text; (e.currentTarget as HTMLElement).style.background = colors.bgCard; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = colors.textMuted; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <FolderPlus size={13} /> New Folder
              </button>
            </div>
          )}
        </div>

        {/* Main content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px', boxSizing: 'border-box' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xxl }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                {selectedFolder && (
                  <FolderOpen size={18} style={{ color: colors.accent, flexShrink: 0 }} />
                )}
                <h1 style={{ margin: 0, fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text }}>
                  {sectionTitle}
                </h1>
                <span style={{ fontSize: fontSize.sm, color: colors.textGhost }}>{visibleShows.length} show{visibleShows.length !== 1 ? 's' : ''}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                {selectedFolder?.role === 'owner' && (
                  <button
                    onClick={() => setShareFolder(selectedFolder)}
                    style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, padding: `${spacing.sm}px ${spacing.lg}px`, fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.text, borderRadius: radius.sm, cursor: 'pointer', background: colors.bgCard, border: `1px solid ${colors.borderMed}`, flexShrink: 0, transition: 'background 0.12s, border-color 0.12s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = colors.bgNav; e.currentTarget.style.borderColor = colors.textMuted; }}
                    onMouseLeave={e => { e.currentTarget.style.background = colors.bgCard; e.currentTarget.style.borderColor = colors.borderMed; }}
                  >
                    <Users size={14} /> Share Folder
                  </button>
                )}
                <button
                  onClick={handleCreate}
                  style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, padding: `${spacing.sm}px ${spacing.lg}px`, fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.text, border: 'none', borderRadius: radius.sm, cursor: 'pointer', background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentDark})`, boxShadow: `0 0 20px rgba(124,58,237,0.2)`, flexShrink: 0, transition: 'opacity 0.12s, box-shadow 0.12s' }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; e.currentTarget.style.boxShadow = '0 0 28px rgba(124,58,237,0.38)'; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.boxShadow = '0 0 20px rgba(124,58,237,0.2)'; }}
                  onMouseDown={e => { e.currentTarget.style.opacity = '0.7'; }}
                  onMouseUp={e => { e.currentTarget.style.opacity = '0.88'; }}
                >
                  <Plus size={15} /> New Show
                </button>
              </div>
            </div>

            {/* Content */}
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', border: `3px solid ${colors.border}`, borderTopColor: colors.accent, animation: 'spin 0.8s linear infinite' }} />
              </div>
            ) : visibleShows.length === 0 ? (
              <div style={{ textAlign: 'center', paddingTop: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: spacing.lg }}>
                <div style={{ fontSize: 48 }}>
                  {selectedView === 'all' ? '🎭' : selectedView === 'unfiled' ? '📄' : '📁'}
                </div>
                <div style={{ fontSize: fontSize.md, color: colors.textSecondary }}>
                  {selectedView === 'all'
                    ? 'No shows yet'
                    : selectedView === 'unfiled'
                    ? 'No unfiled shows'
                    : 'This folder is empty'}
                </div>
                <div style={{ fontSize: fontSize.sm, color: colors.textMuted }}>
                  {selectedView === 'all'
                    ? 'Create your first show to start choreographing'
                    : 'Click New Show to add one here'}
                </div>
                <button
                  onClick={handleCreate}
                  style={{ marginTop: spacing.sm, padding: `${spacing.md}px ${spacing.xl}px`, fontSize: fontSize.md, fontWeight: fontWeight.medium, color: colors.text, border: 'none', borderRadius: radius.sm, cursor: 'pointer', background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentDark})`, transition: 'opacity 0.12s, box-shadow 0.12s', boxShadow: '0 0 20px rgba(124,58,237,0.2)' }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; e.currentTarget.style.boxShadow = '0 0 28px rgba(124,58,237,0.38)'; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.boxShadow = '0 0 20px rgba(124,58,237,0.2)'; }}
                  onMouseDown={e => { e.currentTarget.style.opacity = '0.7'; }}
                  onMouseUp={e => { e.currentTarget.style.opacity = '0.88'; }}
                >
                  New Show
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: spacing.lg }}>
                {visibleShows.map(show => (
                  <ProjectCard
                    key={show.id}
                    show={show}
                    folders={folders}
                    onOpen={() => { window.history.pushState({}, '', `/?show=${show.id}`); onOpenShow(show.id); }}
                    onDelete={() => handleDelete(show.id)}
                    onLeave={() => handleLeave(show.id)}
                    onRename={title => handleRename(show.id, title)}
                    onMoveToFolder={folderId => handleMoveToFolder(show.id, folderId)}
                    onDuplicate={() => handleDuplicate(show.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
