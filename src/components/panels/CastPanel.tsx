import { useState } from 'react';
import { Plus, X, GripVertical } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import type { DropResult } from '@hello-pangea/dnd';
import { useShowStore } from '../../store/showStore';
import { colors, fontSize, radius, spacing } from '../../lib/theme';
import { PanelHeader } from '../ui/PanelHeader';

interface CastPanelProps {
  onClose: () => void;
}

const dragHandleStyle: React.CSSProperties = {
  flexShrink: 0, width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: colors.textGhost, cursor: 'grab', touchAction: 'none',
};

export function CastPanel({ onClose }: CastPanelProps) {
  const {
    performers, props, performerGroups,
    addPerformer, addProp,
    addPerformerGroup, deletePerformerGroup, updatePerformerGroup,
    reorderPerformers, reorderProps, reorderPerformerGroups,
    selectedItem, selectedItemIds,
    setSelectedItemIds,
  } = useShowStore();
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  const sortedPerformers = [...performers].sort((a, b) => a.order_index - b.order_index);
  const sortedGroups = [...performerGroups].sort((a, b) => a.order_index - b.order_index);
  const sortedProps = [...props].sort((a, b) => a.order_index - b.order_index);

  function handleDragEnd(result: DropResult) {
    const { source, destination } = result;
    if (!destination || source.index === destination.index) return;
    if (source.droppableId === 'performers') reorderPerformers(source.index, destination.index);
    else if (source.droppableId === 'groups') reorderPerformerGroups(source.index, destination.index);
    else if (source.droppableId === 'props') reorderProps(source.index, destination.index);
  }

  return (
    <div>
      <PanelHeader title="Cast & Props" onClose={onClose} />
      <DragDropContext onDragEnd={handleDragEnd}>
        <div style={{ padding: spacing.md, display: 'flex', flexDirection: 'column', gap: spacing.sm }}>

          {/* Performers */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xxs }}>
            <span style={{ fontSize: fontSize.md, color: colors.textMuted }}>Performers
              {performers.length > 0 && <span style={{ marginLeft: 6, fontSize: fontSize.sm, color: colors.textFaint, fontVariantNumeric: 'tabular-nums' }}>{performers.length}</span>}
            </span>
            <button
              style={{ fontSize: fontSize.md, color: colors.accentLight, background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: spacing.xxs }}
              onClick={addPerformer}
            >
              <Plus size={13} /> Add
            </button>
          </div>

          <Droppable droppableId="performers">
            {provided => (
              <div ref={provided.innerRef} {...provided.droppableProps}>
                {sortedPerformers.map((p, index) => {
                  const group = performerGroups.find(g => g.id === p.group_id);
                  const isSelected = selectedItemIds.includes(p.id) || (selectedItem?.type === 'performer' && selectedItem.id === p.id);
                  return (
                    <Draggable key={p.id} draggableId={p.id} index={index}>
                      {dragProvided => (
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          style={{
                            display: 'flex', alignItems: 'center',
                            borderRadius: radius.sm,
                            background: isSelected ? colors.bgCard : 'transparent',
                            border: `1px solid ${isSelected ? colors.accent : 'transparent'}`,
                            ...dragProvided.draggableProps.style,
                          }}
                        >
                          <span {...dragProvided.dragHandleProps} style={dragHandleStyle}>
                            <GripVertical size={12} />
                          </span>
                          <button
                            style={{
                              display: 'flex', alignItems: 'center', gap: spacing.sm, padding: `${spacing.xs}px ${spacing.sm}px`,
                              cursor: 'pointer', width: '100%', textAlign: 'left', background: 'transparent', border: 'none',
                            }}
                            onClick={() => { setSelectedItemIds([p.id]); }}
                          >
                            <div style={{
                              width: 13, height: 13, flexShrink: 0, background: p.color,
                              borderRadius: p.shape === 'circle' ? '50%' : radius.xs,
                              clipPath: p.shape === 'triangle' ? 'polygon(50% 0%, 0% 100%, 100% 100%)' : 'none',
                            }} />
                            <span style={{ fontSize: fontSize.md, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                              {p.name}
                            </span>
                            {group && <div style={{ width: 7, height: 7, borderRadius: '50%', background: group.color, flexShrink: 0 }} />}
                          </button>
                        </div>
                      )}
                    </Draggable>
                  );
                })}
                {provided.placeholder}
              </div>
            )}
          </Droppable>

          {performers.length === 0 && (
            <div style={{ fontSize: fontSize.md, color: colors.textFaint, paddingLeft: spacing.xs }}>No performers yet</div>
          )}

          {/* Groups */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm, marginBottom: spacing.xxs }}>
            <span style={{ fontSize: fontSize.md, color: colors.textMuted }}>Groups
              {performerGroups.length > 0 && <span style={{ marginLeft: 6, fontSize: fontSize.sm, color: colors.textFaint, fontVariantNumeric: 'tabular-nums' }}>{performerGroups.length}</span>}
            </span>
            <button
              style={{ fontSize: fontSize.md, color: colors.accentLight, background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: spacing.xxs }}
              onClick={addPerformerGroup}
            >
              <Plus size={13} /> Add
            </button>
          </div>

          <Droppable droppableId="groups">
            {provided => (
              <div ref={provided.innerRef} {...provided.droppableProps}>
                {sortedGroups.map((g, index) => {
                  const groupPerformerIds = performers.filter(p => p.group_id === g.id).map(p => p.id);
                  const isGroupSelected = groupPerformerIds.length > 0 && groupPerformerIds.every(id => selectedItemIds.includes(id));
                  return (
                    <Draggable key={g.id} draggableId={g.id} index={index}>
                      {dragProvided => (
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          style={{
                            display: 'flex', alignItems: 'center', gap: spacing.sm, padding: `${spacing.xs}px ${spacing.sm}px`,
                            borderRadius: radius.sm,
                            background: isGroupSelected ? colors.bgCard : 'transparent',
                            border: `1px solid ${isGroupSelected ? colors.accent : 'transparent'}`,
                            marginBottom: spacing.xxs,
                            ...dragProvided.draggableProps.style,
                          }}
                        >
                          <span {...dragProvided.dragHandleProps} style={dragHandleStyle}>
                            <GripVertical size={12} />
                          </span>
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: g.color, flexShrink: 0 }} />
                          {editingGroupId === g.id ? (
                            <input
                              className="panel-input"
                              style={{ flex: 1, fontSize: fontSize.sm, padding: `${spacing.xxs}px ${spacing.xs}px`, height: 20 }}
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
                                <span style={{ color: colors.textFaint, marginLeft: spacing.xs }}>{groupPerformerIds.length}</span>
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
                      )}
                    </Draggable>
                  );
                })}
                {provided.placeholder}
              </div>
            )}
          </Droppable>

          {performerGroups.length === 0 && (
            <div style={{ fontSize: fontSize.md, color: colors.textFaint, paddingLeft: spacing.xs }}>No groups yet</div>
          )}

          {/* Props */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm, marginBottom: spacing.xxs }}>
            <span style={{ fontSize: fontSize.md, color: colors.textMuted }}>Props
              {props.length > 0 && <span style={{ marginLeft: 6, fontSize: fontSize.sm, color: colors.textFaint, fontVariantNumeric: 'tabular-nums' }}>{props.length}</span>}
            </span>
            <button
              style={{ fontSize: fontSize.md, color: colors.accentLight, background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: spacing.xxs }}
              onClick={addProp}
            >
              <Plus size={13} /> Add
            </button>
          </div>

          <Droppable droppableId="props">
            {provided => (
              <div ref={provided.innerRef} {...provided.droppableProps}>
                {sortedProps.map((p, index) => {
                  const isSelected = selectedItemIds.includes(p.id);
                  return (
                    <Draggable key={p.id} draggableId={p.id} index={index}>
                      {dragProvided => (
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          style={{
                            display: 'flex', alignItems: 'center',
                            borderRadius: radius.sm,
                            background: isSelected ? colors.bgCard : 'transparent',
                            border: `1px solid ${isSelected ? colors.accent : 'transparent'}`,
                            ...dragProvided.draggableProps.style,
                          }}
                        >
                          <span {...dragProvided.dragHandleProps} style={dragHandleStyle}>
                            <GripVertical size={12} />
                          </span>
                          <button
                            style={{
                              flex: 1, display: 'flex', alignItems: 'center', gap: spacing.sm,
                              padding: `${spacing.xs}px ${spacing.sm}px`, background: 'transparent', border: 'none',
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
                            <span style={{ fontSize: fontSize.md, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {p.name}
                            </span>
                          </button>
                        </div>
                      )}
                    </Draggable>
                  );
                })}
                {provided.placeholder}
              </div>
            )}
          </Droppable>

          {props.length === 0 && (
            <div style={{ fontSize: fontSize.md, color: colors.textFaint, paddingLeft: spacing.xs }}>No props yet</div>
          )}
        </div>
      </DragDropContext>
    </div>
  );
}
