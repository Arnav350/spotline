import { useState, useRef, useEffect, useCallback } from 'react';
import { useShowStore } from '../store/showStore';

export interface LoopRange {
  start: number;
  end: number;
}

// Web Audio API instead of an <audio> element: AudioBufferSourceNode's native loop/
// loopStart/loopEnd wraps inside the audio graph itself, with no seek/decode latency —
// which is the only way to get a truly gapless loop in a browser. The trade-off is that
// a source node is one-shot (play once, then discarded), so "pausing" means stopping it
// and remembering the track position to start a fresh node from on resume.
export function usePlayback() {
  const { show, formations, setActiveFormation, audioVolume, audioMuted, setIsPlaying: setStoreIsPlaying, setAnimationState, endAnimation } = useShowStore();

  const [isPlaying, setIsPlaying] = useState(false);
  const [audioTime, setAudioTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const animFrameRef = useRef<number>(0);

  const audioTimeRef = useRef(0);
  const formationsRef = useRef(formations);
  formationsRef.current = formations;
  audioTimeRef.current = audioTime;

  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  // Position tracking for a running source: the track time it started at, and the
  // AudioContext clock reading at that moment — current position is the sum of the two
  // deltas. There's no currentTime readback on a source node like there is on <audio>.
  const startedAtTrackTimeRef = useRef(0);
  const startedAtCtxTimeRef = useRef(0);

  function getCtx(): AudioContext {
    if (!audioCtxRef.current) {
      const ctx = new AudioContext();
      const gain = ctx.createGain();
      gain.gain.value = audioMuted ? 0 : audioVolume;
      gain.connect(ctx.destination);
      audioCtxRef.current = ctx;
      gainNodeRef.current = gain;
    }
    return audioCtxRef.current;
  }

  function stopSource() {
    const src = sourceRef.current;
    if (!src) return;
    // Calling .stop() itself fires 'ended' — detach the handler first so that doesn't
    // get mistaken for the track having finished naturally.
    src.onended = null;
    try { src.stop(); } catch { /* already stopped */ }
    src.disconnect();
    sourceRef.current = null;
  }

  // Loop region (GarageBand-style) — a personal playback preference, not persisted or
  // synced: each collaborator sets their own loop while rehearsing a section.
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [loopRange, setLoopRangeState] = useState<LoopRange | null>(null);
  const loopEnabledRef = useRef(false);
  const loopRangeRef = useRef<LoopRange | null>(null);
  loopEnabledRef.current = loopEnabled;
  loopRangeRef.current = loopRange;

  // Push a loop change onto whatever source is currently playing — loopStart/loopEnd are
  // live attributes the audio graph checks continuously, so this takes effect immediately
  // without having to restart playback.
  function applyLoopToSource(range: LoopRange | null, enabled: boolean) {
    const src = sourceRef.current;
    if (!src) return;
    if (enabled && range) {
      src.loop = true;
      src.loopStart = range.start;
      src.loopEnd = bufferRef.current ? Math.min(range.end, bufferRef.current.duration) : range.end;
    } else {
      src.loop = false;
    }
  }

  // Dragging a new region (re)enables looping, same as GarageBand; an explicit clear
  // (null) also turns looping off so there's nothing left to loop.
  const setLoopRange = useCallback((range: LoopRange | null) => {
    setLoopRangeState(range);
    setLoopEnabled(range !== null);
    applyLoopToSource(range, range !== null);
  }, []);

  const toggleLoopEnabled = useCallback(() => {
    setLoopEnabled(v => {
      const next = !v;
      applyLoopToSource(loopRangeRef.current, next);
      return next;
    });
  }, []);

  // Marks an in-progress "advance past the end of the music" run (see tickPostEnd below):
  // the wall-clock moment it started and the show time it started at.
  const postEndStartRef = useRef<{ perfStart: number; timeStart: number } | null>(null);

  // Sync volume/mute onto the gain node
  useEffect(() => {
    getCtx();
    if (gainNodeRef.current) gainNodeRef.current.gain.value = audioMuted ? 0 : audioVolume;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioVolume, audioMuted]);

  // (Re)load and decode when the music URL changes — stops anything currently playing,
  // since it belonged to whatever track was previously loaded.
  useEffect(() => {
    cancelAnimationFrame(animFrameRef.current);
    stopSource();
    postEndStartRef.current = null;
    setIsPlaying(false);
    setStoreIsPlaying(false);
    bufferRef.current = null;
    setAudioDuration(0);
    setAudioTime(0);
    startedAtTrackTimeRef.current = 0;
    if (!show?.music_url) return;

    let cancelled = false;
    const ctx = getCtx();
    fetch(show.music_url)
      .then(r => r.arrayBuffer())
      .then(ab => ctx.decodeAudioData(ab))
      .then(buf => {
        if (cancelled) return;
        bufferRef.current = buf;
        setAudioDuration(buf.duration);
      })
      .catch(err => console.error('Failed to load/decode audio', err));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show?.music_url]);

  // Release the AudioContext on unmount. Clearing the refs matters under React
  // StrictMode's dev-only mount→cleanup→mount: without it, getCtx() on the second mount
  // sees a still-set (but now-closed) audioCtxRef and hands back a dead context instead
  // of creating a fresh one — every call on it then throws "Context is closed".
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      stopSource();
      audioCtxRef.current?.close().catch(() => { /* already closing/closed */ });
      audioCtxRef.current = null;
      gainNodeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function computeTrackTime(): number {
    const ctx = audioCtxRef.current;
    if (!ctx || !sourceRef.current) return startedAtTrackTimeRef.current;
    let t = startedAtTrackTimeRef.current + (ctx.currentTime - startedAtCtxTimeRef.current);
    // Mirror the native loop wrap in JS so the UI/formations reflect it — the audio
    // itself already loops correctly in the graph regardless of this calculation.
    if (sourceRef.current.loop) {
      const loop = loopRangeRef.current;
      if (loop && t >= loop.end) {
        const span = loop.end - loop.start;
        t = span > 0 ? loop.start + ((t - loop.end) % span) : loop.start;
      }
    }
    return t;
  }

  // Starts a fresh source node at trackTime — the only way to "play" with Web Audio,
  // since a node can't be reused once started.
  function playFrom(trackTime: number) {
    const buffer = bufferRef.current;
    if (!buffer) return;
    stopSource();
    const ctx = getCtx();
    ctx.resume();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const loop = loopEnabledRef.current ? loopRangeRef.current : null;
    if (loop) {
      source.loop = true;
      source.loopStart = loop.start;
      source.loopEnd = Math.min(loop.end, buffer.duration);
    }
    source.connect(gainNodeRef.current!);
    source.onended = handleMusicEnded;
    source.start(0, Math.min(trackTime, buffer.duration));
    sourceRef.current = source;
    startedAtCtxTimeRef.current = ctx.currentTime;
    startedAtTrackTimeRef.current = trackTime;
  }

  // Shared by tick() and tickPostEnd(): sets whichever formation owns time t as active,
  // driving its transition animation if t falls inside one. Returns false if t is past
  // every formation (including when there are none), so the caller knows to stop.
  const applyTimeToFormations = useCallback((t: number) => {
    const fs = formationsRef.current;
    let cum = 0;
    for (let i = 0; i < fs.length; i++) {
      const f = fs[i];
      if (t >= cum && t < cum + f.duration) {
        setActiveFormation(f.id, f.transition_duration);
        const transitionDur = f.transition_duration || 0;
        const timeInFormation = t - cum;
        // formationsRef deliberately excludes the starting formation (see
        // addStartFormation), so the very first real formation has no "previous" entry
        // in this array to transition from — it's the starting formation instead, if one
        // exists, which playback should transition out of exactly like any other formation.
        const fromId = i > 0 ? fs[i - 1].id : useShowStore.getState().formations.find(sf => sf.order_index === -1)?.id;
        if (fromId && transitionDur > 0 && timeInFormation < transitionDur) {
          setAnimationState(fromId, timeInFormation / transitionDur);
        } else {
          endAnimation();
        }
        return true;
      }
      cum += f.duration;
    }
    return false;
  }, [setActiveFormation, setAnimationState, endAnimation]);

  // Keeps the playhead moving at real-time rate once the music has ended but formations
  // still remain — a wall-clock-driven stand-in for the audio-driven tick() below, since
  // there's no audio progressing time for us past the track's own end.
  const tickPostEnd = useCallback(() => {
    const start = postEndStartRef.current;
    if (!start) return;
    const totalDuration = formationsRef.current.reduce((a, f) => a + f.duration, 0);
    const t = start.timeStart + (performance.now() - start.perfStart) / 1000;
    if (t >= totalDuration) {
      setAudioTime(totalDuration);
      const fs = formationsRef.current;
      if (fs.length > 0) { setActiveFormation(fs[fs.length - 1].id, 0); endAnimation(); }
      postEndStartRef.current = null;
      setIsPlaying(false);
      setStoreIsPlaying(false);
      cancelAnimationFrame(animFrameRef.current);
      return;
    }
    setAudioTime(t);
    applyTimeToFormations(t);
    animFrameRef.current = requestAnimationFrame(tickPostEnd);
  }, [applyTimeToFormations, setActiveFormation, endAnimation, setStoreIsPlaying]);

  const tick = useCallback(() => {
    if (!sourceRef.current) return;
    const t = computeTrackTime();
    setAudioTime(t);
    applyTimeToFormations(t);
    animFrameRef.current = requestAnimationFrame(tick);
  }, [applyTimeToFormations]);

  // Reached when a non-looping source plays through to the actual end of the buffer (a
  // looping source's 'ended' only fires on an explicit .stop(), which stopSource() already
  // detaches the handler before calling — so this is always a genuine natural end).
  function handleMusicEnded() {
    sourceRef.current = null;
    const totalDuration = formationsRef.current.reduce((a, f) => a + f.duration, 0);
    const endTime = bufferRef.current?.duration ?? 0;
    if (totalDuration > endTime) {
      // The show has formations past where the music runs out — keep the playhead going.
      postEndStartRef.current = { perfStart: performance.now(), timeStart: endTime };
      animFrameRef.current = requestAnimationFrame(tickPostEnd);
      return;
    }
    cancelAnimationFrame(animFrameRef.current);
    setIsPlaying(false);
    setStoreIsPlaying(false);
  }

  function handlePlay() {
    if (!show?.music_url) return;
    if (isPlaying) {
      cancelAnimationFrame(animFrameRef.current);
      postEndStartRef.current = null;
      if (sourceRef.current) {
        const t = computeTrackTime();
        stopSource();
        startedAtTrackTimeRef.current = t;
        setAudioTime(t);
      }
      setIsPlaying(false);
      setStoreIsPlaying(false);
      endAnimation();
    } else {
      if (!bufferRef.current) return; // still loading/decoding
      const loop = loopEnabledRef.current ? loopRangeRef.current : null;
      const startAt = loop ? loop.start : audioTimeRef.current;
      setAudioTime(startAt);
      setStoreIsPlaying(true);
      setIsPlaying(true);
      const dur = bufferRef.current.duration;
      if (dur > 0 && startAt >= dur) {
        // Resuming (or starting) past where the music ends — nothing to play, just
        // keep advancing through whatever formations remain.
        postEndStartRef.current = { perfStart: performance.now(), timeStart: startAt };
        animFrameRef.current = requestAnimationFrame(tickPostEnd);
      } else {
        playFrom(startAt);
        animFrameRef.current = requestAnimationFrame(tick);
      }
    }
  }

  function seekToTime(t: number) {
    const time = Math.max(0, t);
    const dur = bufferRef.current?.duration ?? 0;
    const wasRunning = sourceRef.current !== null || postEndStartRef.current !== null;
    cancelAnimationFrame(animFrameRef.current);
    postEndStartRef.current = null;
    if (wasRunning) {
      if (dur > 0 && time >= dur) {
        stopSource();
        postEndStartRef.current = { perfStart: performance.now(), timeStart: time };
        animFrameRef.current = requestAnimationFrame(tickPostEnd);
      } else {
        playFrom(time);
        animFrameRef.current = requestAnimationFrame(tick);
      }
    } else {
      startedAtTrackTimeRef.current = time;
    }
    setAudioTime(time);

    const fs = formationsRef.current;
    let cum = 0;
    let matched = false;
    for (const f of fs) {
      if (time >= cum && time < cum + f.duration) { setActiveFormation(f.id, wasRunning ? f.transition_duration : 0.3); matched = true; break; }
      cum += f.duration;
    }
    // Past every formation (e.g. scrubbed into the post-music tail beyond the last one) —
    // land on whichever formation is last rather than leaving the old one showing.
    if (!matched && fs.length > 0) setActiveFormation(fs[fs.length - 1].id, wasRunning ? 0 : 0.3);
  }

  function formatTime(s: number) {
    const m = Math.floor(s / 60);
    return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
  }

  return {
    isPlaying, setIsPlaying,
    audioTime, setAudioTime,
    audioDuration,
    audioTimeRef, formationsRef,
    handlePlay,
    seekToTime,
    formatTime,
    loopEnabled, loopRange,
    setLoopRange, toggleLoopEnabled,
  };
}
