import { useState, useRef, useEffect, useCallback } from 'react';
import { useShowStore } from '../store/showStore';

export function usePlayback(audioRef: React.RefObject<HTMLAudioElement | null>) {
  const { show, formations, setActiveFormation, audioVolume, audioMuted, setIsPlaying: setStoreIsPlaying, setAnimationState, endAnimation } = useShowStore();

  const [isPlaying, setIsPlaying] = useState(false);
  const [audioTime, setAudioTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const animFrameRef = useRef<number>(0);

  const audioTimeRef = useRef(0);
  const formationsRef = useRef(formations);
  formationsRef.current = formations;
  audioTimeRef.current = audioTime;

  // Sync volume/muted
  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = audioMuted ? 0 : audioVolume;
  }, [audioVolume, audioMuted, audioRef]);

  // Reload when music URL changes
  useEffect(() => {
    if (!audioRef.current || !show?.music_url) return;
    if (isPlaying) audioRef.current.pause();
    audioRef.current.src = show.music_url;
    audioRef.current.load();
  }, [show?.music_url]);

  const tick = useCallback(() => {
    if (!audioRef.current) return;
    const t = audioRef.current.currentTime;
    setAudioTime(t);
    const fs = formationsRef.current;
    let cum = 0;
    for (let i = 0; i < fs.length; i++) {
      const f = fs[i];
      if (t >= cum && t < cum + f.duration) {
        setActiveFormation(f.id, f.transition_duration);
        const transitionDur = f.transition_duration || 0;
        const timeInFormation = t - cum;
        if (i > 0 && transitionDur > 0 && timeInFormation < transitionDur) {
          setAnimationState(fs[i - 1].id, timeInFormation / transitionDur);
        } else {
          endAnimation();
        }
        break;
      }
      cum += f.duration;
    }
    if (!audioRef.current.paused) {
      animFrameRef.current = requestAnimationFrame(tick);
    }
  }, [setActiveFormation, setAnimationState, endAnimation, audioRef]);

  function handlePlay() {
    if (!audioRef.current || !show?.music_url) return;
    if (isPlaying) {
      audioRef.current.pause();
      cancelAnimationFrame(animFrameRef.current);
      setIsPlaying(false);
      setStoreIsPlaying(false);
      endAnimation();
    } else {
      audioRef.current.currentTime = audioTimeRef.current;
      audioRef.current.play();
      setStoreIsPlaying(true);
      animFrameRef.current = requestAnimationFrame(tick);
      setIsPlaying(true);
    }
  }

  function seekToTime(t: number) {
    const time = Math.max(0, t);
    if (audioRef.current) audioRef.current.currentTime = Math.min(audioDuration || time, time);
    setAudioTime(time);
    const paused = !audioRef.current || audioRef.current.paused;
    let cum = 0;
    for (const f of formationsRef.current) {
      if (time >= cum && time < cum + f.duration) { setActiveFormation(f.id, paused ? 0.3 : f.transition_duration); break; }
      cum += f.duration;
    }
  }

  function formatTime(s: number) {
    const m = Math.floor(s / 60);
    return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
  }

  return {
    isPlaying, setIsPlaying,
    audioTime, setAudioTime,
    audioDuration, setAudioDuration,
    animFrameRef,
    audioTimeRef, formationsRef,
    tick,
    handlePlay,
    seekToTime,
    formatTime,
  };
}
