import React, { useEffect, useState } from 'react';
import { Layers, Music, Users, Settings } from 'lucide-react';
import { useShowStore } from '../store/showStore';
import { colors, fontSize, fontWeight, radius } from '../lib/theme';
import { FormationPanel } from './panels/FormationPanel';
import { AudioPanel } from './panels/AudioPanel';
import { CastPanel } from './panels/CastPanel';
import { StagePanel } from './panels/StagePanel';

export type NavPanel = 'formation' | 'audio' | 'cast' | 'stage';

export const NAV_WIDTH = 88;
export const CONTENT_WIDTH = 240;

const NAV_ITEMS: { id: NavPanel; icon: React.ReactNode; label: string }[] = [
  { id: 'formation', icon: <Layers size={24} />, label: 'Formation' },
  { id: 'audio', icon: <Music size={24} />, label: 'Audio' },
  { id: 'cast', icon: <Users size={24} />, label: 'Cast' },
  { id: 'stage', icon: <Settings size={24} />, label: 'Stage' },
];

interface PropertyPanelProps {
  activePanel: NavPanel | null;
  onPanelChange: (panel: NavPanel | null) => void;
}

export default function PropertyPanel({ activePanel, onPanelChange }: PropertyPanelProps) {
  const { selectedItem, selectedItemIds } = useShowStore();
  const [hoveredPanel, setHoveredPanel] = useState<NavPanel | null>(null);

  useEffect(() => {
    if (selectedItem?.type === 'performer') onPanelChange('formation');
  }, [selectedItem]);

  useEffect(() => {
    if (selectedItemIds.length > 0) onPanelChange('formation');
  }, [selectedItemIds]);

  const close = () => onPanelChange(null);

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* Icon nav strip */}
      <div style={{
        width: NAV_WIDTH,
        flexShrink: 0,
        borderRight: `1px solid ${colors.border}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: 8,
        gap: 8,
        background: colors.bgNav,
      }}>
        {NAV_ITEMS.map(item => {
          const isActive = activePanel === item.id;
          const isHovered = hoveredPanel === item.id && !isActive;
          return (
            <button
              key={item.id}
              onClick={() => onPanelChange(activePanel === item.id ? null : item.id)}
              onMouseEnter={() => setHoveredPanel(item.id)}
              onMouseLeave={() => setHoveredPanel(null)}
              style={{
                width: NAV_WIDTH - 16,
                padding: 8,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                borderRadius: radius.lg,
                border: 'none',
                cursor: 'pointer',
                background: isActive ? colors.bgCard : isHovered ? colors.bgCard : 'transparent',
                color: isActive ? colors.accentLight : isHovered ? colors.textSecondary : colors.textMuted,
                transition: 'color 0.15s, background 0.15s',
              }}
            >
              {item.icon}
              <span style={{
                fontSize: fontSize.sm,
                fontWeight: fontWeight.bold,
                letterSpacing: '0.05em',
                lineHeight: 1,
                textTransform: 'uppercase',
              }}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Content panel */}
      {activePanel !== null && (
        <div style={{ width: CONTENT_WIDTH, flexShrink: 0, overflowY: 'auto', background: colors.bgPanel }}>
          {activePanel === 'formation' && <FormationPanel onClose={close} />}
          {activePanel === 'audio' && <AudioPanel onClose={close} />}
          {activePanel === 'cast' && <CastPanel onClose={close} />}
          {activePanel === 'stage' && <StagePanel onClose={close} />}
        </div>
      )}
    </div>
  );
}
