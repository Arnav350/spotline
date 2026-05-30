import React, { useState, useRef } from 'react';
import { Upload, X, Volume2, VolumeX, Plus, Music2 } from 'lucide-react';
import { useShowStore } from '../../store/showStore';
import { colors, fontSize, radius } from '../../lib/theme';
import { PanelHeader } from '../ui/PanelHeader';

interface AudioPanelProps {
  onClose: () => void;
}

function SegmentRow({ segmentId, isSelected }: { segmentId: string; isSelected: boolean }) {
  const { audioSegments, show, updateAudioSegment, deleteAudioSegment, setSelectedAudioSegment } = useShowStore();
  const seg = audioSegments.find(s => s.id === segmentId);
  const [editing, setEditing] = useState(false);
  const [nameVal, setNameVal] = useState(seg?.name ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  if (!seg) return null;

  const bpm = show?.bpm;
  const durationLabel = bpm && bpm > 0
    ? `${Math.round(seg.duration * bpm / 60)} beats`
    : `${seg.duration.toFixed(1)}s`;

  function startEdit(e: React.MouseEvent) {
    if (!isSelected) return;
    e.stopPropagation();
    setNameVal(seg!.name);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function commitName() {
    const trimmed = nameVal.trim() || 'Segment';
    updateAudioSegment(seg!.id, { name: trimmed });
    setEditing(false);
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 8px',
        borderRadius: radius.md,
        background: colors.bgCard,
        border: `1px solid ${isSelected ? seg.color : colors.border}`,
        cursor: 'pointer',
      }}
      onMouseDown={e => e.stopPropagation()}
      onClick={() => setSelectedAudioSegment(isSelected ? null : seg.id)}
    >
      {/* Color swatch */}
      <div style={{ width: 3, height: 22, borderRadius: radius.xs, background: seg.color, flexShrink: 0 }} />

      {/* Name + duration */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <input
            ref={inputRef}
            value={nameVal}
            onChange={e => setNameVal(e.target.value)}
            onBlur={commitName}
            onKeyDown={e => {
              if (e.key === 'Enter') commitName();
              if (e.key === 'Escape') setEditing(false);
              e.stopPropagation();
            }}
            onClick={e => e.stopPropagation()}
            autoFocus
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              outline: `1px solid ${seg.color}`,
              borderRadius: radius.xs,
              color: colors.text,
              fontSize: fontSize.md,
              padding: '0 2px',
              fontFamily: 'inherit',
            }}
          />
        ) : (
          <div
            style={{
              fontSize: fontSize.md,
              color: isSelected ? colors.textSecondary : colors.textMuted,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              cursor: isSelected ? 'text' : 'pointer',
            }}
            onDoubleClick={startEdit}
          >
            {seg.name}
          </div>
        )}
        <div style={{ fontSize: fontSize.sm, color: colors.textFaint }}>{durationLabel}</div>
      </div>

      {/* Delete button */}
      <button
        style={{
          flexShrink: 0,
          width: 16,
          height: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: colors.textGhost,
          transition: 'color 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.color = colors.danger)}
        onMouseLeave={e => (e.currentTarget.style.color = colors.textGhost)}
        onClick={e => { e.stopPropagation(); deleteAudioSegment(seg.id); }}
      >
        <X size={11} />
      </button>
    </div>
  );
}

export function AudioPanel({ onClose }: AudioPanelProps) {
  const {
    show, uploadMusic, removeMusic, audioVolume, audioMuted, setAudioVolume, setAudioMuted,
    audioSegments, selectedAudioSegmentId, addAudioSegment,
  } = useShowStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loadingMusic, setLoadingMusic] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoadingMusic(true);
    setUploadError(null);
    try {
      await uploadMusic(file);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setLoadingMusic(false);
      e.target.value = '';
    }
  }

  const sortedSegments = [...audioSegments].sort((a, b) => a.order_index - b.order_index);

  return (
    <div>
      <PanelHeader title="Audio" onClose={onClose} />
      <div style={{ padding: '10px 12px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input ref={fileInputRef} type="file" accept="audio/*" style={{ display: 'none' }} onChange={handleFileChange} />

        {show?.music_url ? (
          <>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: colors.bgCard, borderRadius: radius.md, padding: '6px 8px',
            }}>
              <Music2 size={12} style={{ color: colors.textFaint, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: fontSize.sm, color: colors.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {show.music_filename || 'Track'}
                </div>
              </div>
              <button
                style={{ flexShrink: 0, width: 20, height: 20, borderRadius: radius.sm, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: colors.textGhost, transition: 'color 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.color = colors.danger)}
                onMouseLeave={e => (e.currentTarget.style.color = colors.textGhost)}
                onClick={removeMusic}
              >
                <X size={12} />
              </button>
            </div>

            <div>
              <label className="panel-label">Volume</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button className="btn-icon" style={{ flexShrink: 0, padding: 4 }} onClick={() => setAudioMuted(!audioMuted)}>
                  {audioMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>
                <div style={{ flex: 1, position: 'relative', height: 20, display: 'flex', alignItems: 'center' }}>
                  <input
                    type="range" min={0} max={1} step={0.01} value={audioVolume}
                    onChange={e => setAudioVolume(parseFloat(e.target.value))}
                    style={{ width: '100%', opacity: audioMuted ? 0.4 : 1, ['--vol-pct' as string]: `${audioVolume * 100}%` } as React.CSSProperties}
                  />
                </div>
                <span style={{ fontSize: fontSize.sm, color: colors.textFaint, minWidth: 28, textAlign: 'right', flexShrink: 0 }}>
                  {Math.round(audioVolume * 100)}%
                </span>
              </div>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button
              className="btn-ghost"
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: fontSize.md, border: `1px solid ${colors.bgCardHover}`, width: '100%', justifyContent: 'center' }}
              onClick={() => fileInputRef.current?.click()}
              disabled={loadingMusic}
            >
              <Upload size={12} />
              {loadingMusic ? 'Uploading…' : 'Upload Music'}
            </button>
            {loadingMusic && (
              <div style={{ width: '100%', height: 3, background: colors.bgCard, borderRadius: radius.xs, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: '40%',
                  background: colors.accent, borderRadius: radius.xs,
                  animation: 'progressSlide 1.2s ease-in-out infinite',
                }} />
              </div>
            )}
            {uploadError && (
              <div style={{ fontSize: fontSize.sm, color: colors.danger, padding: '2px 0' }}>
                {uploadError}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Segments section */}
      <div style={{ borderTop: `1px solid ${colors.border}` }}>
        <div style={{ padding: '8px 12px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: fontSize.sm, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Segments
          </span>
          <button
            style={{
              display: 'flex', alignItems: 'center', gap: 3,
              fontSize: fontSize.md, color: colors.accentLight,
              background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = colors.text)}
            onMouseLeave={e => (e.currentTarget.style.color = colors.accentLight)}
            onClick={addAudioSegment}
          >
            <Plus size={12} /> Add
          </button>
        </div>

        <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {sortedSegments.length === 0 ? (
            <div style={{ fontSize: fontSize.md, color: colors.textGhost, paddingTop: 2 }}>No segments yet</div>
          ) : (
            sortedSegments.map(seg => (
              <SegmentRow
                key={seg.id}
                segmentId={seg.id}
                isSelected={seg.id === selectedAudioSegmentId}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
