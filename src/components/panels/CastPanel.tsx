import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useShowStore } from '../../store/showStore';
import { colors, fontSize, radius } from '../../lib/theme';
import { PanelHeader } from '../ui/PanelHeader';

interface CastPanelProps {
  onClose: () => void;
}

export function CastPanel({ onClose }: CastPanelProps) {
  const {
    performers, props, performerGroups,
    addPerformer, addProp,
    addPerformerGroup, deletePerformerGroup, updatePerformerGroup,
    selectedItem, selectedItemIds,
    setSelectedItemIds,
  } = useShowStore();
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  return (
    <div>
      <PanelHeader title="Cast & Props" onClose={onClose} />
      <div style={{ padding: '10px 12px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>

        {/* Performers */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
          <span style={{ fontSize: fontSize.base, color: colors.textMuted }}>Performers</span>
          <button
            style={{ fontSize: fontSize.base, color: colors.accentLight, background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}
            onClick={addPerformer}
          >
            <Plus size={13} /> Add
          </button>
        </div>

        {performers.map(p => {
          const group = performerGroups.find(g => g.id === p.group_id);
          const isSelected = selectedItemIds.includes(p.id) || (selectedItem?.type === 'performer' && selectedItem.id === p.id);
          return (
            <button
              key={p.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px',
                borderRadius: radius.sm,
                background: isSelected ? colors.bgCard : 'transparent',
                border: `1px solid ${isSelected ? colors.accent : 'transparent'}`,
                cursor: 'pointer', width: '100%', textAlign: 'left',
              }}
              onClick={() => { setSelectedItemIds([p.id]); }}
            >
              <div style={{
                width: 13, height: 13, flexShrink: 0, background: p.color,
                borderRadius: p.shape === 'circle' ? '50%' : radius.xs,
                clipPath: p.shape === 'triangle' ? 'polygon(50% 0%, 0% 100%, 100% 100%)' : 'none',
              }} />
              <span style={{ fontSize: fontSize.md, color: colors.textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {p.name}
              </span>
              {group && <div style={{ width: 7, height: 7, borderRadius: '50%', background: group.color, flexShrink: 0 }} />}
            </button>
          );
        })}

        {performers.length === 0 && (
          <div style={{ fontSize: fontSize.base, color: colors.textFaint, paddingLeft: 4 }}>No performers yet</div>
        )}

        {/* Groups */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 2 }}>
          <span style={{ fontSize: fontSize.base, color: colors.textMuted }}>Groups</span>
          <button
            style={{ fontSize: fontSize.base, color: colors.accentLight, background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}
            onClick={addPerformerGroup}
          >
            <Plus size={13} /> Add
          </button>
        </div>

        {performerGroups.map(g => {
          const groupPerformerIds = performers.filter(p => p.group_id === g.id).map(p => p.id);
          const isGroupSelected = groupPerformerIds.length > 0 && groupPerformerIds.every(id => selectedItemIds.includes(id));
          return (
            <div
              key={g.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px',
                borderRadius: radius.sm,
                background: isGroupSelected ? colors.bgCard : 'transparent',
                border: `1px solid ${isGroupSelected ? colors.accent : 'transparent'}`,
                marginBottom: 2,
              }}
            >
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: g.color, flexShrink: 0 }} />
              {editingGroupId === g.id ? (
                <input
                  className="panel-input"
                  style={{ flex: 1, fontSize: fontSize.sm, padding: '2px 4px', height: 20 }}
                  value={g.name}
                  autoFocus
                  onChange={e => updatePerformerGroup(g.id, { name: e.target.value })}
                  onBlur={() => setEditingGroupId(null)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditingGroupId(null); }}
                />
              ) : (
                <button
                  style={{ flex: 1, textAlign: 'left', fontSize: fontSize.sm, color: colors.textSecondary, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
                  onClick={() => setSelectedItemIds(groupPerformerIds)}
                  onDoubleClick={() => setEditingGroupId(g.id)}
                >
                  {g.name}
                  {groupPerformerIds.length > 0 && (
                    <span style={{ color: colors.textFaint, marginLeft: 4 }}>{groupPerformerIds.length}</span>
                  )}
                </button>
              )}
              <button
                style={{ flexShrink: 0, width: 16, height: 16, background: 'transparent', border: 'none', cursor: 'pointer', color: colors.textGhost, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                onMouseEnter={e => (e.currentTarget.style.color = colors.danger)}
                onMouseLeave={e => (e.currentTarget.style.color = colors.textGhost)}
                onClick={() => deletePerformerGroup(g.id)}
              >
                <X size={10} />
              </button>
            </div>
          );
        })}

        {performerGroups.length === 0 && (
          <div style={{ fontSize: fontSize.base, color: colors.textFaint, paddingLeft: 4 }}>No groups yet</div>
        )}

        {/* Props */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 2 }}>
          <span style={{ fontSize: fontSize.base, color: colors.textMuted }}>Props</span>
          <button
            style={{ fontSize: fontSize.base, color: colors.accentLight, background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}
            onClick={addProp}
          >
            <Plus size={13} /> Add
          </button>
        </div>

        {props.map(p => {
          const isSelected = selectedItemIds.includes(p.id);
          return (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center',
              borderRadius: radius.sm,
              background: isSelected ? colors.bgCard : 'transparent',
              border: `1px solid ${isSelected ? colors.accent : 'transparent'}`,
            }}>
              <button
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', gap: 8,
                  padding: '5px 8px', background: 'transparent', border: 'none',
                  cursor: 'pointer', textAlign: 'left', minWidth: 0,
                }}
                onClick={() => {
                  if (isSelected) {
                    setSelectedItemIds(selectedItemIds.filter(x => x !== p.id));
                  } else {
                    setSelectedItemIds([p.id]);
                  }
                }}
              >
                <div style={{
                  width: 13, height: 13, flexShrink: 0, background: p.color,
                  borderRadius: p.shape === 'circle' ? '50%' : p.shape === 'square' ? radius.xs : '0',
                  clipPath: p.shape === 'triangle'
                    ? 'polygon(50% 0%, 0% 100%, 100% 100%)'
                    : p.shape === 'star'
                    ? 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)'
                    : 'none',
                }} />
                <span style={{ fontSize: fontSize.md, color: colors.textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name}
                </span>
              </button>
            </div>
          );
        })}

        {props.length === 0 && (
          <div style={{ fontSize: fontSize.base, color: colors.textFaint, paddingLeft: 4 }}>No props yet</div>
        )}
      </div>
    </div>
  );
}
