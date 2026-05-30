import { useState, useEffect } from 'react';
import { X, Copy, Check, UserMinus, Folder } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { colors, fontSize, fontWeight, radius } from '../lib/theme';
import type { Invitation, ShowMember, Profile, ShowMemberRole } from '../lib/types';
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

  const isOwner = isFolder
    ? true  // only owners can open the folder share modal
    : members.find(m => m.user_id === user?.id)?.role === 'owner';

  useEffect(() => { loadData(); }, [showId, folderId]);

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
      <div style={{ width: 480, maxHeight: '80vh', display: 'flex', flexDirection: 'column', background: colors.bgPanel, border: `1px solid ${colors.borderMed}`, borderRadius: radius.xl, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${colors.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isFolder && <Folder size={15} style={{ color: colors.accent }} />}
            <span style={{ fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text }}>
              {isFolder ? `Share "${folderTitle || 'Folder'}"` : 'Share Show'}
            </span>
          </div>
          <button className="btn-icon" onClick={onClose}><X size={16} /></button>
        </div>

        {isFolder && (
          <div style={{ padding: '10px 20px', background: 'rgba(124,58,237,0.08)', borderBottom: `1px solid ${colors.border}`, fontSize: fontSize.sm, color: colors.textSecondary }}>
            Sharing this folder grants access to all current and future shows inside it.
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Invite by email */}
          {isOwner && (
            <div>
              <label className="panel-label">Invite by email</label>
              <form onSubmit={handleInvite} style={{ display: 'flex', gap: 6 }}>
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
                  style={{ padding: '0 14px', fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.text, border: 'none', borderRadius: radius.sm, cursor: sending ? 'not-allowed' : 'pointer', background: sending ? colors.borderMed : colors.accent, flexShrink: 0, whiteSpace: 'nowrap' }}
                >
                  {sending ? '…' : 'Invite'}
                </button>
              </form>
              {error && <div style={{ marginTop: 6, fontSize: fontSize.sm, color: colors.danger }}>{error}</div>}
              {info && <div style={{ marginTop: 6, fontSize: fontSize.sm, color: colors.success }}>{info}</div>}
            </div>
          )}

          {/* Pending invitations */}
          {invitations.length > 0 && (
            <div>
              <label className="panel-label" style={{ marginBottom: 8 }}>Pending invitations</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {invitations.map(inv => (
                  <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: colors.bgCard, borderRadius: radius.sm, border: `1px solid ${colors.border}` }}>
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
            <label className="panel-label" style={{ marginBottom: 8 }}>
              {isFolder ? 'Folder members' : 'Members'} ({displayMembers.length})
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {displayMembers.map(m => {
                const p = (m as any).profile as Profile | undefined;
                const name = p?.display_name || 'Unknown';
                const isMe = m.user_id === user?.id;
                const isMemberOwner = m.role === 'owner';
                return (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: radius.sm, background: isMe ? 'rgba(124,58,237,0.06)' : 'transparent' }}>
                    <div style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, background: isMe ? colors.accent : (p ? colorFromUserId(p.id) : colors.borderMed), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.text }}>
                      {name.slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: fontSize.sm, color: colors.text }}>
                        {name}{isMe && <span style={{ marginLeft: 6, fontSize: fontSize.sm, color: colors.textMuted }}>(you)</span>}
                      </div>
                    </div>
                    {isOwner && !isMe && !isMemberOwner ? (
                      <select
                        className="panel-input"
                        value={m.role}
                        onChange={e => handleChangeRole(m.id, e.target.value as ShowMemberRole)}
                        style={{ width: 90, padding: '3px 6px', fontSize: fontSize.sm }}
                      >
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    ) : (
                      <span style={{ fontSize: fontSize.sm, color: roleColor(m.role), border: `1px solid ${roleColor(m.role)}`, borderRadius: radius.xs, padding: '1px 5px', opacity: 0.8 }}>
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
