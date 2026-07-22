import React, { useState, useRef, useEffect } from 'react';
import { Undo2, Redo2, Monitor, Box, Keyboard, ChevronLeft, UserPlus, LogOut, Pencil } from 'lucide-react';
import { useShowStore } from '../store/showStore';
import { useAuthStore } from '../store/authStore';
import { isSupabaseConfigured } from '../lib/supabase';
import { colors, fontSize, fontWeight, radius, spacing } from '../lib/theme';
import InviteModal from './InviteModal';
import { colorFromUserId } from '../lib/colors';

function OnlineIndicator({ others, selfName, selfColor }: {
  others: { user_id: string; name: string; color: string }[];
  selfName: string;
  selfColor: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const total = others.length + 1;

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const allUsers = [
    { user_id: 'self', name: selfName, color: selfColor, isSelf: true },
    ...others.map(c => ({ ...c, isSelf: false })),
  ];

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: spacing.sm,
          background: open ? colors.bgCard : 'transparent',
          border: `1px solid ${open ? colors.borderMed : 'transparent'}`,
          borderRadius: radius.sm, cursor: 'pointer',
          padding: `${spacing.xs}px ${spacing.sm}px`, transition: 'all 0.15s',
          fontSize: fontSize.sm, color: colors.textSecondary,
        }}
        onMouseEnter={e => { if (!open) { const el = e.currentTarget as HTMLElement; el.style.background = colors.bgCard; el.style.borderColor = colors.borderSubtle; } }}
        onMouseLeave={e => { if (!open) { const el = e.currentTarget as HTMLElement; el.style.background = 'transparent'; el.style.borderColor = 'transparent'; } }}
      >
        <div style={{ position: 'relative', width: 8, height: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: colors.success }} />
          {total > 1 && (
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%', background: colors.success,
              animation: 'online-ping 2s cubic-bezier(0,0,0.2,1) infinite',
            }} />
          )}
        </div>
        <span>{total === 1 ? 'Just you' : `${total} online`}</span>
        {others.slice(0, 3).map((c, i) => (
          <div key={c.user_id} style={{
            width: 20, height: 20, borderRadius: '50%', background: c.color,
            border: `2px solid ${colors.bgPanel}`, marginLeft: i === 0 ? spacing.xxs : -6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: 'white', flexShrink: 0,
          }}>
            {c.name.slice(0, 2).toUpperCase()}
          </div>
        ))}
        {others.length > 3 && (
          <span style={{ fontSize: fontSize.sm, color: colors.textFaint, marginLeft: spacing.xxs }}>+{others.length - 3}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', marginTop: spacing.xs, zIndex: 100,
          background: colors.bgPanel, border: `1px solid ${colors.borderMed}`,
          borderRadius: radius.sm, overflow: 'hidden', minWidth: 180,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          <div style={{ padding: `${spacing.sm}px ${spacing.md}px`, borderBottom: `1px solid ${colors.border}`, fontSize: fontSize.sm, color: colors.textFaint, fontWeight: fontWeight.medium, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {total} online
          </div>
          {allUsers.map(u => (
            <div key={u.user_id} style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, padding: `${spacing.sm}px ${spacing.md}px` }}>
              <div style={{
                width: 26, height: 26, borderRadius: '50%', background: u.color, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: 'white',
              }}>
                {u.name.slice(0, 2).toUpperCase()}
              </div>
              <span style={{ fontSize: fontSize.sm, color: colors.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {u.name}
              </span>
              {u.isSelf && <span style={{ fontSize: fontSize.sm, color: colors.textFaint }}>(you)</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UserMenu({ onSignOut, onShowShortcuts }: { onSignOut: () => void; onShowShortcuts?: () => void }) {
  const { profile } = useAuthStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!profile) return null;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: spacing.sm,
          background: open ? colors.bgCard : 'transparent',
          border: `1px solid ${open ? colors.borderMed : 'transparent'}`,
          borderRadius: radius.sm, cursor: 'pointer',
          padding: `${spacing.xs}px ${spacing.sm}px ${spacing.xs}px ${spacing.xs}px`, transition: 'all 0.15s',
        }}
        onMouseEnter={e => { if (!open) { const el = e.currentTarget as HTMLElement; el.style.background = colors.bgCard; el.style.borderColor = colors.borderSubtle; } }}
        onMouseLeave={e => { if (!open) { const el = e.currentTarget as HTMLElement; el.style.background = 'transparent'; el.style.borderColor = 'transparent'; } }}
      >
        <div style={{
          width: 24, height: 24, borderRadius: '50%', background: colors.accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: 'white', flexShrink: 0,
        }}>
          {profile.display_name.slice(0, 2).toUpperCase()}
        </div>
        <span style={{ fontSize: fontSize.sm, color: colors.textSecondary, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {profile.display_name}
        </span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', marginTop: spacing.xs, zIndex: 100,
          background: colors.bgPanel, border: `1px solid ${colors.borderMed}`,
          borderRadius: radius.sm, overflow: 'hidden', minWidth: 160,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          <div style={{ padding: `${spacing.md}px ${spacing.md}px ${spacing.sm}px`, borderBottom: `1px solid ${colors.border}` }}>
            <div style={{ fontSize: fontSize.sm, color: colors.text, fontWeight: fontWeight.medium }}>{profile.display_name}</div>
          </div>
          {onShowShortcuts && (
            <button
              onClick={() => { onShowShortcuts(); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: spacing.sm, width: '100%',
                padding: `${spacing.sm}px ${spacing.md}px`, background: 'none', border: 'none', cursor: 'pointer',
                fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'left',
              }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = colors.text; el.style.background = colors.bgCard; }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = colors.textSecondary; el.style.background = 'none'; }}
            >
              <Keyboard size={13} /> Keyboard shortcuts
            </button>
          )}
          <button
            onClick={() => { onSignOut(); setOpen(false); }}
            style={{
              display: 'flex', alignItems: 'center', gap: spacing.sm, width: '100%',
              padding: `${spacing.sm}px ${spacing.md}px`, background: 'none', border: 'none', cursor: 'pointer',
              fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'left',
            }}
            onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = colors.text; el.style.background = colors.bgCard; }}
            onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = colors.textSecondary; el.style.background = 'none'; }}
          >
            <LogOut size={13} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

interface TopBarProps {
  onShowShortcuts?: () => void;
  onBackToDashboard?: () => void;
}

export default function TopBar({ onShowShortcuts, onBackToDashboard }: TopBarProps) {
  const {
    show, viewMode, setViewMode, undo, redo, history, historyIndex,
    updateShowTitle, isSaving, collaborators, localUserId, localUserColor, currentUserRole, isPublicView,
  } = useShowStore();
  const isViewer = currentUserRole === 'viewer';
  const { signOut, profile } = useAuthStore();

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  function handleTitleClick() {
    setTitleDraft(show?.title || 'Untitled Show');
    setEditingTitle(true);
    setTimeout(() => titleRef.current?.select(), 10);
  }

  function handleTitleBlur() {
    if (titleDraft.trim()) updateShowTitle(titleDraft.trim());
    setEditingTitle(false);
  }

  function handleTitleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') titleRef.current?.blur();
    if (e.key === 'Escape') setEditingTitle(false);
  }

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;
  const otherCollaborators = collaborators.filter(c => c.user_id !== localUserId);

  function handleNavHome(e: React.MouseEvent) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      window.open('/', '_blank');
    } else if (isPublicView) {
      window.location.href = '/';
    } else {
      onBackToDashboard?.();
    }
  }

  return (
    <>
      {showInvite && show && (
        <InviteModal showId={show.id} showFolderId={show.folder_id} onClose={() => setShowInvite(false)} />
      )}

      <div style={{
        display: 'flex', alignItems: 'center', height: 48, padding: isPublicView ? `0 ${spacing.md}px 0 ${spacing.xl}px` : `0 ${spacing.md}px`,
        gap: spacing.sm, flexShrink: 0, background: colors.bgPanel,
        borderBottom: `1px solid ${colors.bgCardHover}`,
      }}>
        {/* Back to dashboard — hidden for public viewers */}
        {onBackToDashboard && !isPublicView && (
          <>
            <button
              className="btn-icon"
              onClick={handleNavHome}
              title="Back to dashboard (⌘Click to open in new tab)"
              style={{ gap: spacing.xs, display: 'flex', alignItems: 'center' }}
            >
              <ChevronLeft size={16} />
            </button>
            <div style={{ width: 1, height: 16, background: colors.borderSubtle }} />
          </>
        )}

        {/* Logo + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, flexShrink: 0 }}>
          <div
            onClick={handleNavHome}
            title={onBackToDashboard ? 'Go home (⌘Click to open in new tab)' : undefined}
            style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, cursor: onBackToDashboard ? 'pointer' : undefined }}
          >
            <div style={{
              width: 20, height: 20, borderRadius: radius.sm,
              background: colors.accent,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{ width: 8, height: 8, borderRadius: radius.xs, background: 'rgba(255,255,255,0.9)' }} />
            </div>
            <span style={{ fontSize: fontSize.md, fontWeight: fontWeight.bold, letterSpacing: '0.12em', color: colors.text, textTransform: 'uppercase' }}>
              SPOTLINE
            </span>
          </div>
          <div style={{ width: 1, height: 16, background: colors.borderSubtle, margin: '0 2px' }} />
          {editingTitle && !isViewer ? (
            <input
              ref={titleRef}
              style={{ fontSize: fontSize.md, fontWeight: fontWeight.medium, color: colors.text, background: 'transparent', outline: 'none', borderBottom: `1px solid ${colors.accent}`, minWidth: 120 }}
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={handleTitleKeyDown}
            />
          ) : (
            <button
              style={{ fontSize: fontSize.md, fontWeight: fontWeight.medium, color: colors.textSecondary, background: 'transparent', border: 'none', cursor: isViewer ? 'default' : 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: spacing.xs }}
              onMouseEnter={e => { if (!isViewer) { e.currentTarget.style.color = colors.text; (e.currentTarget.querySelector('.title-pencil') as HTMLElement | null)?.style.setProperty('opacity', '1'); } }}
              onMouseLeave={e => { e.currentTarget.style.color = colors.textSecondary; (e.currentTarget.querySelector('.title-pencil') as HTMLElement | null)?.style.setProperty('opacity', '0'); }}
              onClick={isViewer ? undefined : handleTitleClick}
            >
              {show?.title || 'Untitled Show'}
              {!isViewer && <Pencil size={11} className="title-pencil" style={{ opacity: 0, color: colors.textFaint, transition: 'opacity 0.15s', flexShrink: 0 }} />}
            </button>
          )}
          {isViewer && (
            <span style={{
              fontSize: fontSize.sm, color: colors.textFaint,
              background: colors.bgCard, border: `1px solid ${colors.borderMed}`,
              borderRadius: radius.sm, padding: `${spacing.xxs}px ${spacing.sm}px`, marginLeft: spacing.xs,
            }}>
              {isPublicView ? 'Public view' : 'View only'}
            </span>
          )}
        </div>

        {/* Undo / redo */}
        {!isViewer && (
          <>
            <div style={{ width: 1, height: 16, background: colors.borderSubtle, marginLeft: spacing.xs }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xxs }}>
              <button className="btn-icon" onClick={undo} disabled={!canUndo} title="Undo (⌘Z)"><Undo2 size={17} /></button>
              <button className="btn-icon" onClick={redo} disabled={!canRedo} title="Redo (⌘⇧Z)"><Redo2 size={17} /></button>
            </div>
          </>
        )}

        {/* Saving indicator */}
        {isSaving && (
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, fontSize: fontSize.sm, color: colors.textFaint }}>
            <div style={{ width: 4, height: 4, borderRadius: '50%', background: colors.accent, animation: 'pulse 1.5s infinite' }} />
            Saving…
          </div>
        )}

        <div style={{ flex: 1 }} />

        {/* 2D / 3D toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xxs, background: colors.bgPanel, border: `1px solid ${colors.borderSubtle}`, borderRadius: radius.sm, padding: spacing.xxs }}>
          {(['2d', '3d'] as const).map(mode => (
            <button
              key={mode}
              style={{
                display: 'flex', alignItems: 'center', gap: spacing.xs,
                fontSize: fontSize.md, padding: `${spacing.xs}px ${spacing.md}px`,
                borderRadius: radius.xs, border: 'none', cursor: 'pointer',
                background: viewMode === mode ? colors.accent : 'transparent',
                color: viewMode === mode ? colors.text : colors.textFaint,
                transition: 'all 0.15s',
              }}
              onClick={() => setViewMode(mode)}
            >
              {mode === '2d' ? <Monitor size={13} /> : <Box size={13} />}
              {mode.toUpperCase()}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 16, background: colors.borderSubtle }} />

        {/* Online users indicator — only shown when others are present */}
        {isSupabaseConfigured() && show && profile && !isPublicView && otherCollaborators.length > 0 && (
          <OnlineIndicator
            others={otherCollaborators.map(c => ({ ...c, color: colorFromUserId(c.user_id) }))}
            selfName={profile.display_name}
            selfColor={localUserColor || colors.accent}
          />
        )}

        {/* Invite collaborators — owners/editors only, not in public view */}
        {isSupabaseConfigured() && show && !isViewer && !isPublicView && (
          <button
            className="btn-ghost"
            style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, fontSize: fontSize.sm }}
            onClick={() => setShowInvite(true)}
          >
            <UserPlus size={13} />
            Invite
          </button>
        )}

        {/* User menu */}
        {isSupabaseConfigured() && !isPublicView && <UserMenu onSignOut={signOut} onShowShortcuts={onShowShortcuts} />}
      </div>
    </>
  );
}
