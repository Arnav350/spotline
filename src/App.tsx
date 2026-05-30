import { useEffect, useLayoutEffect, useState, useRef } from 'react';
import { useShowStore } from './store/showStore';
import { useAuthStore } from './store/authStore';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import { colors, fontSize, fontWeight, radius } from './lib/theme';
import { useRealtimeSync } from './hooks/useRealtimeSync';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import TopBar from './components/TopBar';
import StageCanvas from './components/StageCanvas';
import Stage3D from './components/Stage3D';
import FormationTimeline from './components/FormationTimeline';
import PropertyPanel, { NAV_WIDTH, CONTENT_WIDTH } from './components/PropertyPanel';
import type { NavPanel } from './components/PropertyPanel';
import ShortcutsModal from './components/ShortcutsModal';
import AuthModal from './components/AuthModal';
import Dashboard from './components/Dashboard';
import { TIMELINE_HEIGHT, TOPBAR_HEIGHT } from './components/timeline/constants';

function useWindowSize() {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const handler = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return size;
}


export default function App() {
  const { show, loadShow, isLoading, viewMode, formations, activeFormationId, pendingTransitionDuration, setSelectedAudioSegment, setLocalUser, toasts, removeToast, realtimeConnected, setAnimationState, setRawAnimProgress, endAnimation } = useShowStore();
  const { session, loading: authLoading, initialize, user, profile } = useAuthStore();
  const { width, height } = useWindowSize();
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [sidebarPanel, setSidebarPanel] = useState<NavPanel | null>('formation');
  const [view, setView] = useState<'loading' | 'auth' | 'dashboard' | 'show'>('loading');
  const [currentShowId, setCurrentShowId] = useState<string | null>(null);

  const animFrameRef = useRef<number>(0);
  const prevActiveIdRef = useRef<string | null>(null);
  const pendingTransitionDurationRef = useRef(pendingTransitionDuration);
  pendingTransitionDurationRef.current = pendingTransitionDuration;

  useKeyboardShortcuts(() => setShowShortcuts(true));

  useEffect(() => {
    initialize();
  }, []);

  // Sync auth identity into showStore so collaborator presence uses real user
  useEffect(() => {
    if (user && profile) {
      setLocalUser(user.id, profile.display_name, colors.accent);
    }
  }, [user, profile]);

  useEffect(() => {
    if (sidebarPanel !== 'audio') setSelectedAudioSegment(null);
  }, [sidebarPanel]);

  useEffect(() => {
    function onMouseDown() { setSelectedAudioSegment(null); }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [setSelectedAudioSegment]);

  // Main routing logic
  useEffect(() => {
    if (authLoading) return;

    const params = new URLSearchParams(window.location.search);
    const showId = params.get('show');
    const inviteToken = params.get('invite');

    if (inviteToken && isSupabaseConfigured() && !session) {
      setView('auth');
      return;
    }

    if (isSupabaseConfigured() && !session) {
      setView('auth');
      return;
    }

    if (showId) {
      setCurrentShowId(showId);
      setView('show');
    } else {
      setView('dashboard');
    }
  }, [authLoading, session]);

  // Accept invite once authenticated
  useEffect(() => {
    if (!user || !isSupabaseConfigured()) return;
    const params = new URLSearchParams(window.location.search);
    const inviteToken = params.get('invite');
    if (!inviteToken) return;

    supabase.rpc('accept_invite', { invite_token: inviteToken }).then(async ({ data, error }) => {
      if (!error && data && !data.error && data.show_id) {
        window.history.replaceState({}, '', `/?show=${data.show_id}`);
        setCurrentShowId(data.show_id);
        setView('show');
      } else {
        // May be a folder invite — try the folder RPC
        const { error: folderErr } = await supabase.rpc('accept_folder_invite', { invite_token: inviteToken });
        if (!folderErr) {
          window.history.replaceState({}, '', '/');
          setView('dashboard');
        }
      }
    });
  }, [user]);

  // Load show when entering show view
  useEffect(() => {
    if (view === 'show' && currentShowId && show?.id !== currentShowId) {
      loadShow(currentShowId);
    }
  }, [view, currentShowId]);

  useRealtimeSync(view === 'show' ? currentShowId : null);

  useLayoutEffect(() => {
    const currentActiveId = activeFormationId;
    if (currentActiveId !== prevActiveIdRef.current && prevActiveIdRef.current !== null) {
      const prev = prevActiveIdRef.current;
      // When audio is playing, tick drives animation directly — skip wall-clock animation
      if (!useShowStore.getState().isPlaying) {
        const transDuration = pendingTransitionDurationRef.current !== null ? pendingTransitionDurationRef.current * 1000 : 200;

        setAnimationState(prev, 0);

        const startTime = performance.now();
        function animate(now: number) {
          const elapsed = now - startTime;
          const progress = Math.min(elapsed / transDuration, 1);
          setRawAnimProgress(progress);
          if (progress < 1) {
            animFrameRef.current = requestAnimationFrame(animate);
          } else {
            endAnimation();
          }
        }

        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = requestAnimationFrame(animate);
      }
    }
    prevActiveIdRef.current = currentActiveId;
    return () => { cancelAnimationFrame(animFrameRef.current); };
  }, [activeFormationId]); // useLayoutEffect: fires before paint so the initial frame is never visible

  function handleOpenShow(showId: string) {
    setCurrentShowId(showId);
    setView('show');
  }

  function handleBackToDashboard() {
    window.history.pushState({}, '', '/');
    setCurrentShowId(null);
    setView('dashboard');
  }

  const sidebarWidth = NAV_WIDTH + (sidebarPanel !== null ? CONTENT_WIDTH : 0);
  const canvasWidth = width - sidebarWidth;
  const canvasHeight = height - TOPBAR_HEIGHT - TIMELINE_HEIGHT;

  if (view === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: colors.bg }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: `3px solid ${colors.border}`, borderTopColor: colors.accent, animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  if (view === 'auth') {
    return <AuthModal />;
  }

  if (view === 'dashboard') {
    return <Dashboard onOpenShow={handleOpenShow} />;
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: colors.bg }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', border: `3px solid ${colors.border}`, borderTopColor: colors.accent, animation: 'spin 0.8s linear infinite' }} />
          <span style={{ color: colors.textFaint, fontSize: fontSize.md }}>Loading show…</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden', background: colors.bg }}>
      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}

      {/* Reconnecting banner */}
      {!realtimeConnected && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
          background: '#b45309', color: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 8, padding: '6px 16px', fontSize: fontSize.sm, fontWeight: fontWeight.medium,
        }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'white', animation: 'pulse 1s infinite' }} />
          Reconnecting…
        </div>
      )}

      {/* Toast notifications */}
      <div style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 999, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
        {toasts.map(toast => (
          <div
            key={toast.id}
            style={{
              background: colors.bgCard, border: `1px solid ${colors.borderMed}`,
              borderRadius: radius.lg, padding: '8px 14px',
              fontSize: fontSize.sm, color: colors.text,
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              display: 'flex', alignItems: 'center', gap: 8,
              animation: 'slideInRight 0.2s ease',
              pointerEvents: 'auto',
            }}
          >
            <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: toast.type === 'error' ? colors.danger : toast.type === 'warning' ? colors.dangerLight : toast.type === 'success' ? colors.success : colors.accent }} />
            {toast.message}
            <button
              onClick={() => removeToast(toast.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textFaint, padding: 0, marginLeft: 4, lineHeight: 1 }}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <TopBar onShowShortcuts={() => setShowShortcuts(true)} onBackToDashboard={handleBackToDashboard} />

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div style={{ width: sidebarWidth, flexShrink: 0, borderRight: `1px solid ${colors.border}`, display: 'flex' }}>
          <PropertyPanel activePanel={sidebarPanel} onPanelChange={setSidebarPanel} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            {viewMode === '2d' ? (
              <StageCanvas
                width={canvasWidth}
                height={canvasHeight}
                showStageDimensions={sidebarPanel === 'stage'}
              />
            ) : (
              <Stage3D
                width={canvasWidth}
                height={canvasHeight}
              />
            )}

            {formations.length === 0 && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: colors.textGhost, fontSize: fontSize.md, marginBottom: 4 }}>No formations yet</div>
                  <div style={{ color: colors.borderSubtle, fontSize: fontSize.sm }}>Add a formation below to start choreographing</div>
                </div>
              </div>
            )}
          </div>

          <div style={{ height: TIMELINE_HEIGHT }}>
            <FormationTimeline showAudioSegments={sidebarPanel === 'audio'} />
          </div>
        </div>
      </div>
    </div>
  );
}
