import { useEffect } from 'react';
import { X } from 'lucide-react';
import { colors, fontSize, fontWeight, radius, spacing } from '../lib/theme';

const SHORTCUTS = [
  { group: 'General', items: [
    { keys: ['⌘', 'Z'], label: 'Undo', editOnly: true },
    { keys: ['⌘', '⇧', 'Z'], label: 'Redo', editOnly: true },
    { keys: ['⌘', 'A'], label: 'Select all performers', editOnly: true },
    { keys: ['Esc'], label: 'Deselect' },
    { keys: ['?'], label: 'Show shortcuts' },
  ]},
  { group: 'Performers', items: [
    { keys: ['⌘', 'C'], label: 'Copy selected positions', editOnly: true },
    { keys: ['⌘', 'V'], label: 'Paste positions', editOnly: true },
    { keys: ['⌫'], label: 'Delete selected', editOnly: true },
    { keys: ['↑', '↓', '←', '→'], label: 'Nudge by one subdivision', editOnly: true },
    { keys: ['⌘', 'drag'], label: 'Additive box select', editOnly: true },
    { keys: ['S'], label: 'Toggle rectangle / lasso select', editOnly: true },
    { keys: ['⌥', 'drag'], label: 'Flip select shape for one drag', editOnly: true },
  ]},
  { group: 'Canvas', items: [
    { keys: ['Scroll'], label: 'Pan' },
    { keys: ['⌃', 'Scroll'], label: 'Zoom' },
    { keys: ['Middle click', 'drag'], label: 'Pan' },
    { keys: ['L'], label: 'Toggle coordinates' },
    { keys: ['H'], label: 'Hide / show offstage (3D)' },
  ]},
  { group: 'Timeline', items: [
    { keys: ['Space'], label: 'Play / Pause' },
    { keys: ['←', '→'], label: 'Previous / Next formation' },
    { keys: ['⌃', 'Scroll'], label: 'Zoom timeline' },
    { keys: ['Click ruler'], label: 'Seek' },
  ]},
];

export default function ShortcutsModal({ onClose, viewerOnly }: { onClose: () => void; viewerOnly?: boolean }) {
  // Public viewers can't edit anything, so drop the shortcuts that require it — showing only
  // what they actually have access to (navigation, playback, canvas viewing).
  const groups = viewerOnly
    ? SHORTCUTS
        .map(g => ({ ...g, items: g.items.filter(i => !i.editOnly) }))
        .filter(g => g.items.length > 0)
    : SHORTCUTS;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' || e.key === '?') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        style={{ background: colors.bg, border: `1px solid ${colors.borderMed}`, borderRadius: radius.lg, padding: `${spacing.xl}px ${spacing.xxl}px`, width: 460, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xl }}>
          <span style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, letterSpacing: '0.05em' }}>Keyboard Shortcuts</span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: colors.textFaint, display: 'flex', alignItems: 'center' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xl }}>
          {groups.map(group => (
            <div key={group.group}>
              <div style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: spacing.sm }}>{group.group}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
                {group.items.map(item => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${spacing.xs}px 0` }}>
                    <span style={{ fontSize: fontSize.md, color: colors.textMuted }}>{item.label}</span>
                    <div style={{ display: 'flex', gap: spacing.xs }}>
                      {item.keys.map((k, i) => (
                        <kbd key={i} style={{ background: colors.bgCardHover, border: `1px solid ${colors.textGhost}`, borderRadius: radius.sm, padding: `${spacing.xxs}px ${spacing.sm}px`, fontSize: fontSize.sm, color: colors.textSecondary, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>{k}</kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
