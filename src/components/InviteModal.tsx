import { useState, useEffect } from 'react';
import { X, Copy, Check, UserMinus, Folder } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { colors, fontSize, fontWeight, radius, spacing } from '../lib/theme';
import type { Invitation, ShowMember, Profile, ShowMemberRole, ShowPublicLink } from '../lib/types';
import { colorFromUserId } from '../lib/colors';

interface InviteModalProps {
  // Exactly one of showId or folderId must be provided
  showId?: string;
  folderId?: string;
  folderTitle?: string;
  onClose: () => void;
}

interface MemberWithProfile extends ShowMember {
  profile?: Profile;
}

interface FolderMember {
  id: string;
  folder_id: string;
  user_id: string;
  role: ShowMemberRole;
  profile?: Profile;
}

export default function InviteModal({ showId, folderId, folderTitle, onClose }: InviteModalProps) {
  const { user } = useAuthStore();
  const isFolder = !!folderId;

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'editor' | 'viewer'>('editor');
  const [members, setMembers] = useState<MemberWithProfile[]>([]);
  const [folderMembers, setFolderMembers] = useState<FolderMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [publicLink, setPublicLink] = useState<ShowPublicLink | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const isOwner = isFolder
    ? true  // only owners can open the folder share modal
    : members.find(m => m.user_id === user?.id)?.role === 'owner';

  useEffect(() => { loadData(); }, [showId, folderId]);

  useEffect(() => {
    if (!showId) return;
    supabase.from('show_public_links').select('*').eq('show_id', showId).maybeSingle()
      .then(({ data }) => setPublicLink(data));
  }, [showId]);

  async function loadData() {
    if (isFolder && folderId) {
      const [{ data: memberRows }, { data: inviteRows }] = await Promise.all([
        supabase.from('folder_members').select('*').eq('folder_id', folderId),
        supabase.from('invitations').select('*').eq('folder_id', folderId).eq('status', 'pending'),
      ]);
      if (memberRows) {
        const userIds = memberRows.map((m: any) => m.user_id);
        const { data: profileRows } = userIds.length
          ? await supabase.from('profiles').select('*').in('id', userIds)
          : { data: [] };
        const profileMap = Object.fromEntries((profileRows || []).map((p: any) => [p.id, p]));
        setFolderMembers(memberRows.map((m: any) => ({ ...m, profile: profileMap[m.user_id] })));
      }
      if (inviteRows) setInvitations(inviteRows as Invitation[]);
    } else if (showId) {
      const [{ data: memberRows }, { data: inviteRows }] = await Promise.all([
        supabase.from('show_members').select('*').eq('show_id', showId),
        supabase.from('invitations').select('*').eq('show_id', showId).eq('status', 'pending'),
      ]);
      if (memberRows) {
        const userIds = memberRows.map((m: any) => m.user_id);
        const { data: profileRows } = userIds.length
          ? await supabase.from('profiles').select('*').in('id', userIds)
          : { data: [] };
        const profileMap = Object.fromEntries((profileRows || []).map((p: any) => [p.id, p]));
        setMembers(memberRows.map((m: any) => ({ ...m, profile: profileMap[m.user_id] })) as MemberWithProfile[]);
      }
      if (inviteRows) setInvitations(inviteRows as Invitation[]);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setInfo(null); setSending(true);
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) { setSending(false); return; }

    const insertPayload: any = {
      inviter_id: user!.id,
      invitee_email: trimmedEmail,
      role,
    };
    if (isFolder) {
      insertPayload.folder_id = folderId;
    } else {
      insertPayload.show_id = showId;
      const already = members.find(m => (m.profile as any)?.email === trimmedEmail);
      if (already) { setError('This person is already a member.'); setSending(false); return; }
    }

    const { data, error: err } = await supabase
      .from('invitations')
      .insert(insertPayload)
      .select()
      .single();

    if (err) {
      setError(err.message);
    } else {
      setInvitations(prev => [...prev, data as Invitation]);
      setEmail('');
      setInfo(`Invitation created. Copy the link below to share it with ${trimmedEmail}.`);
    }
    setSending(false);
  }

  async function handleRevoke(inviteId: string) {
    await supabase.from('invitations').update({ status: 'revoked' }).eq('id', inviteId);
    setInvitations(prev => prev.filter(i => i.id !== inviteId));
  }

  async function handleRemoveMember(memberId: string, userId: string) {
    if (userId === user?.id) return;
    if (isFolder) {
      await supabase.from('folder_members').delete().eq('id', memberId);
      setFolderMembers(prev => prev.filter(m => m.id !== memberId));
    } else {
      await supabase.from('show_members').delete().eq('id', memberId);
      setMembers(prev => prev.filter(m => m.id !== memberId));
    }
  }

  async function handleChangeRole(memberId: string, newRole: ShowMemberRole) {
    if (isFolder) {
      await supabase.from('folder_members').update({ role: newRole }).eq('id', memberId);
      setFolderMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m));
    } else {
      await supabase.from('show_members').update({ role: newRole }).eq('id', memberId);
      setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m));
    }
  }

  async function handleTogglePublicLink(enabled: boolean) {
    if (!showId) return;
    setLinkLoading(true);
    const { data } = await supabase.rpc('upsert_public_link', { p_show_id: showId, p_enabled: enabled });
    if (data?.[0]) setPublicLink(prev => ({ ...(prev ?? { id: '', show_id: showId, created_at: '' }), ...data[0] }));
    setLinkLoading(false);
  }

  async function handleCopyPublicLink() {
    if (!publicLink?.token) return;
    await navigator.clipboard.writeText(`${window.location.origin}/?view=${publicLink.token}`);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  function getInviteLink(token: string) {
    return `${window.location.origin}/?invite=${token}`;
  }

  async function copyLink(token: string) {
    await navigator.clipboard.writeText(getInviteLink(token));
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  }

  const roleColor = (r: ShowMemberRole) =>
    r === 'owner' ? colors.accent : r === 'editor' ? colors.success : colors.textSecondary;

  const displayMembers = isFolder ? folderMembers : members;

  return (
    <div
      style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', zIndex: 200 }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ width: 480, maxHeight: '80vh', display: 'flex', flexDirection: 'column', background: colors.bgPanel, border: `1px solid ${colors.borderMed}`, borderRadius: radius.lg, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${spacing.lg}px ${spacing.xl}px`, borderBottom: `1px solid ${colors.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
            {isFolder && <Folder size={15} style={{ color: colors.accent }} />}
            <span style={{ fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text }}>
              {isFolder ? `Share "${folderTitle || 'Folder'}"` : 'Share Show'}
            </span>
          </div>
          <button className="btn-icon" onClick={onClose}><X size={16} /></button>
        </div>

        {isFolder && (
          <div style={{ padding: `${spacing.md}px ${spacing.xl}px`, background: 'rgba(124,58,237,0.08)', borderBottom: `1px solid ${colors.border}`, fontSize: fontSize.sm, color: colors.textSecondary }}>
            Sharing this folder grants access to all current and future shows inside it.
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: `${spacing.lg}px ${spacing.xl}px`, display: 'flex', flexDirection: 'column', gap: spacing.xl }}>
          {/* Public link — show only */}
          {!isFolder && isOwner && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginBottom: publicLink?.enabled ? spacing.sm : 0 }}>
                <div>
                  <label className="panel-label" style={{ marginBottom: -4 }}>Public link</label>
                  <span style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>Anyone with the link can view</span>
                </div>
                <button
                  disabled={linkLoading}
                  onClick={() => handleTogglePublicLink(!(publicLink?.enabled ?? false))}
                  style={{
                    width: 36, height: 20, borderRadius: radius.xl, border: 'none',
                    cursor: linkLoading ? 'wait' : 'pointer',
                    background: publicLink?.enabled ? colors.accent : colors.borderMed,
                    position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                  }}
                >
                  <div style={{
                    position: 'absolute', top: 2, left: publicLink?.enabled ? 18 : 2,
                    width: 16, height: 16, borderRadius: '50%', background: 'white',
                    transition: 'left 0.2s',
                  }} />
                </button>
              </div>
              {publicLink?.enabled && (
                <div style={{ display: 'flex', gap: spacing.sm }}>
                  <input
                    readOnly
                    className="panel-input"
                    value={`${window.location.origin}/?view=${publicLink.token}`}
                    style={{ flex: 1, minWidth: 0, color: colors.textSecondary }}
                    onFocus={e => e.currentTarget.select()}
                  />
                  <button
                    onClick={handleCopyPublicLink}
                    style={{
                      display: 'flex', alignItems: 'center', gap: spacing.xs, padding: `${spacing.sm}px ${spacing.md}px`,
                      background: colors.bgCard, border: `1px solid ${colors.borderMed}`,
                      borderRadius: radius.sm, cursor: 'pointer', fontSize: fontSize.lg,
                      color: linkCopied ? colors.success : colors.textSecondary, flexShrink: 0,
                      transition: 'color 0.15s',
                    }}
                  >
                    {linkCopied ? <Check size={13} /> : <Copy size={13} />}
                    {linkCopied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Invite by email */}
          {isOwner && (
            <div>
              <label className="panel-label">Invite by email</label>
              <form onSubmit={handleInvite} style={{ display: 'flex', gap: spacing.sm }}>
                <input
                  className="panel-input"
                  type="email"
                  placeholder="colleague@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  style={{ flex: 1 }}
                />
                <select
                  className="panel-input"
                  value={role}
                  onChange={e => setRole(e.target.value as 'editor' | 'viewer')}
                  style={{ width: 90 }}
                >
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button
                  type="submit"
                  disabled={sending || !email.trim()}
                  style={{ padding: `0 ${spacing.md}px`, fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.text, border: 'none', borderRadius: radius.sm, cursor: sending ? 'not-allowed' : 'pointer', background: sending ? colors.borderMed : colors.accent, flexShrink: 0, whiteSpace: 'nowrap' }}
                >
                  {sending ? '…' : 'Invite'}
                </button>
              </form>
              {error && <div style={{ marginTop: spacing.sm, fontSize: fontSize.sm, color: colors.danger }}>{error}</div>}
              {info && <div style={{ marginTop: spacing.sm, fontSize: fontSize.sm, color: colors.success }}>{info}</div>}
            </div>
          )}

          {/* Pending invitations */}
          {invitations.length > 0 && (
            <div>
              <label className="panel-label" style={{ marginBottom: spacing.sm }}>Pending invitations</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                {invitations.map(inv => (
                  <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, padding: `${spacing.sm}px ${spacing.md}px`, background: colors.bgCard, borderRadius: radius.sm, border: `1px solid ${colors.border}` }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: fontSize.sm, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.invitee_email}</div>
                      <div style={{ fontSize: fontSize.sm, color: colors.textMuted, marginTop: 1 }}>
                        <span style={{ color: roleColor(inv.role as ShowMemberRole) }}>{inv.role}</span>
                        {' · expires '}{new Date(inv.expires_at).toLocaleDateString()}
                      </div>
                    </div>
                    <button className="btn-icon" onClick={() => copyLink(inv.token)} title="Copy invite link" style={{ color: copied === inv.token ? colors.success : colors.textSecondary }}>
                      {copied === inv.token ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                    {isOwner && (
                      <button className="btn-icon" onClick={() => handleRevoke(inv.id)} title="Revoke invite" style={{ color: colors.textMuted }}>
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Members list */}
          <div>
            <label className="panel-label" style={{ marginBottom: spacing.sm }}>
              {isFolder ? 'Folder members' : 'Members'} ({displayMembers.length})
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
              {displayMembers.map(m => {
                const p = (m as any).profile as Profile | undefined;
                const name = p?.display_name || 'Unknown';
                const isMe = m.user_id === user?.id;
                const isMemberOwner = m.role === 'owner';
                return (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: spacing.md, padding: `${spacing.sm}px ${spacing.md}px`, borderRadius: radius.sm, background: isMe ? 'rgba(124,58,237,0.06)' : 'transparent' }}>
                    <div style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, background: isMe ? colors.accent : (p ? colorFromUserId(p.id) : colors.borderMed), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.text }}>
                      {name.slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: fontSize.sm, color: colors.text }}>
                        {name}{isMe && <span style={{ marginLeft: spacing.sm, fontSize: fontSize.sm, color: colors.textMuted }}>(you)</span>}
                      </div>
                    </div>
                    {isOwner && !isMe && !isMemberOwner ? (
                      <select
                        className="panel-input"
                        value={m.role}
                        onChange={e => handleChangeRole(m.id, e.target.value as ShowMemberRole)}
                        style={{ width: 90, padding: `${spacing.xs}px ${spacing.sm}px`, fontSize: fontSize.sm }}
                      >
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    ) : (
                      <span style={{ fontSize: fontSize.sm, color: roleColor(m.role), border: `1px solid ${roleColor(m.role)}`, borderRadius: radius.xs, padding: `1px ${spacing.xs}px`, opacity: 0.8 }}>
                        {m.role}
                      </span>
                    )}
                    {isOwner && !isMe && !isMemberOwner && (
                      <button className="btn-icon" onClick={() => handleRemoveMember(m.id, m.user_id)} title="Remove member" style={{ color: colors.textMuted }}>
                        <UserMinus size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
