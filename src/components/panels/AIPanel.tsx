import { useState, useRef, useEffect } from 'react';
import { Sparkles, X } from 'lucide-react';
import { useShowStore } from '../../store/showStore';
import { colors, fontSize, fontWeight, radius, spacing } from '../../lib/theme';
import { PanelHeader } from '../ui/PanelHeader';
import { generateFormation, getAIUsage, getCachedAIUsage } from '../../lib/aiFormationService';

interface AIPanelProps {
  onClose: () => void;
}

export function AIPanel({ onClose }: AIPanelProps) {
  const {
    show, formations, performers, performerGroups,
    performerPositions, activeFormationId,
    bulkSetPerformerPositions, addToast,
  } = useShowStore();

  const [prompt, setPrompt] = useState('');
  const [usePrev, setUsePrev] = useState(true);
  const [useNext, setUseNext] = useState(true);
  const [loading, setLoading] = useState(false);
  const cached = getCachedAIUsage();
  const [remaining, setRemaining] = useState<number | null>(cached?.remaining ?? null);
  const [weeklyLimit, setWeeklyLimit] = useState<number | null>(cached?.limit ?? null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    getAIUsage().then(usage => {
      if (usage !== null) {
        setRemaining(usage.remaining);
        setWeeklyLimit(usage.limit);
      }
    });
  }, []);

  const sortedFormations = [...formations].sort((a, b) => a.order_index - b.order_index);
  const activeIndex = sortedFormations.findIndex(f => f.id === activeFormationId);
  const hasPrev = activeIndex > 0;
  const hasNext = activeIndex < sortedFormations.length - 1;
  const prevFormation = usePrev && hasPrev ? sortedFormations[activeIndex - 1] : null;
  const nextFormation = useNext && hasNext ? sortedFormations[activeIndex + 1] : null;

  async function handleGenerate() {
    if (!show || !activeFormationId) return;
    cancelledRef.current = false;
    setLoading(true);
    try {
      const { positions, remaining: newRemaining, limit: newLimit } = await generateFormation({
        prompt,
        stageConfig: show.stage_config,
        performers,
        groups: performerGroups,
        formationId: activeFormationId,
        performerPositions,
        prevFormationId: prevFormation?.id ?? null,
        nextFormationId: nextFormation?.id ?? null,
      });
      if (!cancelledRef.current) {
        bulkSetPerformerPositions(activeFormationId, positions);
        if (newRemaining !== null) setRemaining(newRemaining);
        if (newLimit !== null) setWeeklyLimit(newLimit);
        addToast('Formation generated', 'success');
      }
    } catch (err) {
      if (!cancelledRef.current) addToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setLoading(false);
      cancelledRef.current = false;
    }
  }

  function handleCancel() {
    cancelledRef.current = true;
    setLoading(false);
  }

  const toggleStyle = (active: boolean, available: boolean) => ({
    padding: `${spacing.xs}px ${spacing.sm}px`,
    borderRadius: radius.sm,
    border: `1px solid ${active && available ? colors.accentLight : colors.border}`,
    background: active && available ? `${colors.accent}33` : 'transparent',
    color: active && available ? colors.accentLight : colors.textFaint,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    cursor: available ? 'pointer' : 'not-allowed',
    opacity: available ? 1 : 0.4,
    transition: 'all 0.15s',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  });

  const activeFormation = formations.find(f => f.id === activeFormationId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PanelHeader title="AI Formation" onClose={onClose} />

      <div style={{ padding: spacing.md, display: 'flex', flexDirection: 'column', gap: spacing.md }}>
        <div style={{ position: 'relative' }}>
          {loading && (
            <div style={{
              position: 'absolute',
              inset: 0,
              background: `${colors.bgPanel}dd`,
              borderRadius: radius.sm,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing.sm,
              zIndex: 10,
            }}>
              <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
              <Sparkles size={20} color={colors.accentLight} style={{ animation: 'spin 1.5s linear infinite' }} />
              <span style={{ fontSize: fontSize.md, color: colors.textSecondary }}>Generating…</span>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md, opacity: loading ? 0.3 : 1, transition: 'opacity 0.2s', pointerEvents: loading ? 'none' : 'auto' }}>
            {activeFormation && (
              <div style={{
                fontSize: fontSize.sm,
                color: colors.textMuted,
                padding: `${spacing.xs}px ${spacing.sm}px`,
                background: colors.bgCard,
                borderRadius: radius.sm,
                border: `1px solid ${colors.border}`,
              }}>
                Editing: <span style={{ color: colors.textSecondary }}>{activeFormation.name}</span>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
              <label style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Context
              </label>
              <div style={{ display: 'flex', gap: spacing.xs }}>
                <button
                  style={toggleStyle(usePrev, hasPrev && remaining !== 0)}
                  onClick={() => hasPrev && remaining !== 0 && setUsePrev(v => !v)}
                  title={!hasPrev ? 'No previous formation' : 'Include previous formation as context'}
                >
                  ← Prev
                </button>
                <button
                  style={toggleStyle(useNext, hasNext && remaining !== 0)}
                  onClick={() => hasNext && remaining !== 0 && setUseNext(v => !v)}
                  title={!hasNext ? 'No next formation' : 'Include next formation as context'}
                >
                  Next →
                </button>
              </div>
              {(prevFormation || nextFormation) && (
                <div style={{ fontSize: fontSize.sm, color: colors.textFaint }}>
                  {[prevFormation && `← ${prevFormation.name}`, nextFormation && `${nextFormation.name} →`]
                    .filter(Boolean).join('  ·  ')}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
              <label style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Description
              </label>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="Describe the formation… or leave blank for a creative suggestion"
                rows={4}
                disabled={remaining === 0}
                style={{
                  width: '100%',
                  background: colors.bgCard,
                  border: `1px solid ${colors.border}`,
                  borderRadius: radius.sm,
                  color: colors.text,
                  fontSize: fontSize.md,
                  padding: spacing.sm,
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                  outline: 'none',
                  opacity: remaining === 0 ? 0.4 : 1,
                  cursor: remaining === 0 ? 'not-allowed' : 'text',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = colors.accentLight; }}
                onBlur={e => { e.currentTarget.style.borderColor = colors.border; }}
              />
            </div>
          </div>
        </div>

        {loading ? (
          <button
            onClick={handleCancel}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing.xs,
              padding: `${spacing.sm}px ${spacing.md}px`,
              borderRadius: radius.md,
              border: `1px solid ${colors.border}`,
              background: 'transparent',
              color: colors.textSecondary,
              fontSize: fontSize.md,
              fontWeight: fontWeight.bold,
              cursor: 'pointer',
              width: '100%',
              transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = colors.danger; e.currentTarget.style.color = colors.danger; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = colors.border; e.currentTarget.style.color = colors.textSecondary; }}
          >
            <X size={14} />
            Cancel
          </button>
        ) : (
          <button
            onClick={handleGenerate}
            disabled={!activeFormationId || remaining === 0}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing.xs,
              padding: `${spacing.sm}px ${spacing.md}px`,
              borderRadius: radius.md,
              border: 'none',
              background: colors.accent,
              color: colors.text,
              fontSize: fontSize.md,
              fontWeight: fontWeight.bold,
              cursor: (!activeFormationId || remaining === 0) ? 'not-allowed' : 'pointer',
              opacity: (!activeFormationId || remaining === 0) ? 0.4 : 1,
              width: '100%',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = colors.accentDark; }}
            onMouseLeave={e => { e.currentTarget.style.background = colors.accent; }}
          >
            <Sparkles size={14} />
            Generate
          </button>
        )}

        {remaining !== null && !loading && (
          remaining === 0 ? (
            <p style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.textSecondary, margin: 0, textAlign: 'center' }}>
              No generations left this week
            </p>
          ) : (
            <p style={{ fontSize: fontSize.sm, color: colors.textFaint, margin: 0, textAlign: 'center' }}>
              {weeklyLimit !== null
                ? `${remaining} of ${weeklyLimit} generations left this week`
                : `${remaining} generations left this week`}
            </p>
          )
        )}
      </div>
    </div>
  );
}
