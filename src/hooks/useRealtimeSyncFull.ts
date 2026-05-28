import { useEffect, useRef, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useShowStore } from '../store/showStore';
import { colorFromUserId } from '../lib/colors';
// TODO: restore localPositionWriteTimes import from showStore when re-enabling cursor/position broadcasts
// For now, use a local map as a placeholder so this archive file compiles.
const localPositionWriteTimes: Record<string, number> = {};

// Ignore realtime echoes of our own saves for this many ms after a local write.
const LOCAL_WRITE_GUARD_MS = 3000;

interface PresenceState {
  userId: string;
  name: string;
  color: string;
  cursorX?: number;
  cursorY?: number;
  activeFormationId?: string | null;
  playheadTime?: number;
  viewMode?: string;
  online_at: string;
}

interface PositionUpdate {
  type: 'performer' | 'prop';
  entityId: string;
  formationId: string;
  x: number;
  y: number;
}

interface FormationUpsert {
  id: string; show_id: string; name: string; notes: string;
  duration: number; transition_duration: number; transition_easing: string; order_index: number;
  performerPositions?: { performerId: string; formationId: string; x: number; y: number }[];
  propPositions?: { propId: string; formationId: string; x: number; y: number }[];
}

interface EphemeralPayload {
  userId: string;
  cursorX?: number;
  cursorY?: number;
  playheadTime?: number;
  activeFormationId?: string | null;
  positionUpdate?: PositionUpdate;
  formationUpsert?: FormationUpsert;
  formationDelete?: string;
  formationsReorder?: { id: string; order_index: number }[];
}

export function useRealtimeSync(showId: string | null) {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const cursorThrottleRef = useRef<number>(0);
  const playheadThrottleRef = useRef<number>(0);
  const positionThrottleRef = useRef<Map<string, number>>(new Map());
  const knownUserIdsRef = useRef<Set<string>>(new Set());
  const wasDisconnectedRef = useRef(false);

  // Broadcast ephemeral state (cursor, playhead, formation) via channel Broadcast.
  // This works on any Supabase project with Realtime enabled, unlike Presence which
  // requires additional Realtime Authorization policies.
  const broadcastEphemeral = useCallback((data: Omit<EphemeralPayload, 'userId'>) => {
    if (!channelRef.current) return;
    const state = useShowStore.getState();
    channelRef.current.send({
      type: 'broadcast',
      event: 'ephemeral',
      payload: { userId: state.localUserId, ...data } satisfies EphemeralPayload,
    });
  }, []);

  // Expose cursor/formation/playhead broadcast so canvas and timeline can call them
  useEffect(() => {
    (window as any).__spotlineBroadcastCursor = (x: number, y: number) => {
      const now = Date.now();
      if (now - cursorThrottleRef.current < 33) return; // ~30fps
      cursorThrottleRef.current = now;
      broadcastEphemeral({ cursorX: x, cursorY: y });
    };
    (window as any).__spotlineBroadcastCursorLeave = () => {
      broadcastEphemeral({ cursorX: undefined, cursorY: undefined });
    };
    (window as any).__spotlineBroadcastFormation = (formationId: string | null) => {
      broadcastEphemeral({ activeFormationId: formationId });
    };
    (window as any).__spotlineBroadcastPlayhead = (time: number) => {
      const now = Date.now();
      if (now - playheadThrottleRef.current < 100) return; // 10fps
      playheadThrottleRef.current = now;
      broadcastEphemeral({ playheadTime: time });
    };
    (window as any).__spotlineBroadcastPosition = (type: 'performer' | 'prop', entityId: string, formationId: string, x: number, y: number) => {
      const now = Date.now();
      const key = `${type}-${entityId}-${formationId}`;
      if (now - (positionThrottleRef.current.get(key) ?? 0) < 33) return; // ~30fps per entity
      positionThrottleRef.current.set(key, now);
      broadcastEphemeral({ positionUpdate: { type, entityId, formationId, x, y } });
    };
    (window as any).__spotlineBroadcastFormationUpsert = (f: FormationUpsert) => {
      broadcastEphemeral({ formationUpsert: f });
    };
    (window as any).__spotlineBroadcastFormationDelete = (formationId: string) => {
      broadcastEphemeral({ formationDelete: formationId });
    };
    (window as any).__spotlineBroadcastFormationsReorder = (order: { id: string; order_index: number }[]) => {
      broadcastEphemeral({ formationsReorder: order });
    };
    return () => {
      delete (window as any).__spotlineBroadcastCursor;
      delete (window as any).__spotlineBroadcastCursorLeave;
      delete (window as any).__spotlineBroadcastFormation;
      delete (window as any).__spotlineBroadcastPlayhead;
      delete (window as any).__spotlineBroadcastPosition;
      delete (window as any).__spotlineBroadcastFormationUpsert;
      delete (window as any).__spotlineBroadcastFormationDelete;
      delete (window as any).__spotlineBroadcastFormationsReorder;
    };
  }, [broadcastEphemeral]);

  // Broadcast formation change whenever activeFormationId changes.
  // playheadTime is NOT included here — tick() and seekToTime() broadcast the
  // accurate audio position, so adding startTime here causes spasming on receivers.
  useEffect(() => {
    const unsub = useShowStore.subscribe(
      (state) => {
        const formationId = state.activeFormationId;
        if (!channelRef.current) return;
        broadcastEphemeral({ activeFormationId: formationId });
      }
    );
    return unsub;
  }, [broadcastEphemeral]);

  useEffect(() => {
    if (!showId || !isSupabaseConfigured()) return;

    knownUserIdsRef.current = new Set();
    wasDisconnectedRef.current = false;

    // Heartbeat: keep last_seen fresh so stale-row detection works
    const heartbeatInterval = setInterval(async () => {
      const state = useShowStore.getState();
      if (!state.localUserId) return;
      await supabase.from('collaborators').update({ last_seen: new Date().toISOString() })
        .eq('show_id', showId).eq('user_id', state.localUserId);
    }, 60_000);

    // ── Postgres changes channel (DB sync) ──────────────────────────────
    const channel = supabase.channel(`show-${showId}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shows', filter: `id=eq.${showId}` }, payload => {
        if (payload.eventType === 'UPDATE' && payload.new) {
          const current = useShowStore.getState().show;
          if (current && payload.new.updated_at > (current.updated_at || '')) {
            useShowStore.setState({ show: payload.new as any });
          }
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'formations', filter: `show_id=eq.${showId}` }, payload => {
        const state = useShowStore.getState();
        if (payload.eventType === 'INSERT') {
          if (!state.formations.find(f => f.id === payload.new.id))
            useShowStore.setState({ formations: [...state.formations, payload.new as any].sort((a, b) => a.order_index - b.order_index) });
        } else if (payload.eventType === 'UPDATE') {
          useShowStore.setState({ formations: state.formations.map(f => f.id === payload.new.id ? { ...f, ...payload.new } : f).sort((a, b) => a.order_index - b.order_index) });
        } else if (payload.eventType === 'DELETE') {
          useShowStore.setState({ formations: state.formations.filter(f => f.id !== payload.old.id) });
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'performers', filter: `show_id=eq.${showId}` }, payload => {
        const state = useShowStore.getState();
        if (payload.eventType === 'INSERT') {
          if (!state.performers.find(p => p.id === payload.new.id))
            useShowStore.setState({ performers: [...state.performers, payload.new as any] });
        } else if (payload.eventType === 'UPDATE') {
          useShowStore.setState({ performers: state.performers.map(p => p.id === payload.new.id ? { ...p, ...payload.new } : p) });
        } else if (payload.eventType === 'DELETE') {
          useShowStore.setState({ performers: state.performers.filter(p => p.id !== payload.old.id) });
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'props', filter: `show_id=eq.${showId}` }, payload => {
        const state = useShowStore.getState();
        if (payload.eventType === 'INSERT') {
          if (!state.props.find(p => p.id === payload.new.id))
            useShowStore.setState({ props: [...state.props, payload.new as any] });
        } else if (payload.eventType === 'UPDATE') {
          useShowStore.setState({ props: state.props.map(p => p.id === payload.new.id ? { ...p, ...payload.new } : p) });
        } else if (payload.eventType === 'DELETE') {
          useShowStore.setState({ props: state.props.filter(p => p.id !== payload.old.id) });
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'performer_positions' }, payload => {
        if (payload.eventType !== 'DELETE' && payload.new) {
          const key = `${payload.new.performer_id}-${payload.new.formation_id}`;
          const lastWrite = localPositionWriteTimes[key] ?? 0;
          if (Date.now() - lastWrite < LOCAL_WRITE_GUARD_MS) return;
          useShowStore.setState(s => ({ performerPositions: { ...s.performerPositions, [key]: payload.new as any } }));
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prop_positions' }, payload => {
        if (payload.eventType !== 'DELETE' && payload.new) {
          const key = `${payload.new.prop_id}-${payload.new.formation_id}`;
          const lastWrite = localPositionWriteTimes[key] ?? 0;
          if (Date.now() - lastWrite < LOCAL_WRITE_GUARD_MS) return;
          useShowStore.setState(s => ({ propPositions: { ...s.propPositions, [key]: payload.new as any } }));
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'collaborators', filter: `show_id=eq.${showId}` }, payload => {
        const localId = useShowStore.getState().localUserId;
        if (payload.eventType === 'INSERT') {
          if (payload.new.user_id === localId) return;
          if (!knownUserIdsRef.current.has(payload.new.user_id)) {
            knownUserIdsRef.current.add(payload.new.user_id);
            useShowStore.getState().addToast(`${payload.new.name} joined the session`, 'info');
          }
          useShowStore.setState(s => {
            if (s.collaborators.find(c => c.user_id === payload.new.user_id)) return s;
            return { collaborators: [...s.collaborators, payload.new as any] };
          });
        } else if (payload.eventType === 'UPDATE') {
          if (payload.new.user_id === localId) return;
          useShowStore.setState(s => {
            if (s.collaborators.find(c => c.user_id === payload.new.user_id)) {
              return { collaborators: s.collaborators.map(c => c.user_id === payload.new.user_id ? { ...c, ...payload.new } : c) };
            }
            return { collaborators: [...s.collaborators, payload.new as any] };
          });
        } else if (payload.eventType === 'DELETE') {
          const leaving = useShowStore.getState().collaborators.find(c => c.user_id === payload.old.user_id);
          if (leaving) {
            knownUserIdsRef.current.delete(leaving.user_id);
            useShowStore.getState().addToast(`${leaving.name} left the session`, 'info');
          }
          useShowStore.setState(s => ({ collaborators: s.collaborators.filter(c => c.user_id !== payload.old.user_id) }));
        }
      })
      // Receive ephemeral updates (cursor, playhead, formation) from other clients via Broadcast.
      .on('broadcast', { event: 'ephemeral' }, ({ payload }: { payload: EphemeralPayload }) => {
        if (!payload?.userId) return;
        const localId = useShowStore.getState().localUserId;
        if (payload.userId === localId) return;

        // Collaborator presence fields
        const receivedAt = payload.playheadTime !== undefined ? Date.now() : undefined;
        useShowStore.setState(s => ({
          collaborators: s.collaborators.map(c => {
            if (c.user_id !== payload.userId) return c;
            return {
              ...c,
              ...(payload.cursorX !== undefined ? { cursor_x: payload.cursorX } : {}),
              ...(payload.cursorY !== undefined ? { cursor_y: payload.cursorY } : {}),
              ...(payload.activeFormationId !== undefined ? { active_formation_id: payload.activeFormationId } : {}),
              ...(payload.playheadTime !== undefined ? { playhead_time: payload.playheadTime, playhead_received_at: receivedAt } : {}),
            };
          }),
        }));

        // Position update
        if (payload.positionUpdate) {
          const { type, entityId, formationId, x, y } = payload.positionUpdate;
          const key = `${entityId}-${formationId}`;
          if (type === 'performer') {
            useShowStore.setState(s => ({
              performerPositions: {
                ...s.performerPositions,
                [key]: { ...s.performerPositions[key], performer_id: entityId, formation_id: formationId, x, y },
              },
            }));
          } else {
            useShowStore.setState(s => ({
              propPositions: {
                ...s.propPositions,
                [key]: { ...s.propPositions[key], prop_id: entityId, formation_id: formationId, x, y },
              },
            }));
          }
        }

        // Formation upsert (add or update)
        if (payload.formationUpsert) {
          const { performerPositions: pp, propPositions: prp, ...formation } = payload.formationUpsert as any;
          useShowStore.setState(s => {
            const exists = s.formations.some(f => f.id === formation.id);
            const newFormations = exists
              ? s.formations.map(f => f.id === formation.id ? { ...f, ...formation } : f)
                  .sort((a, b) => a.order_index - b.order_index)
              : [...s.formations, formation].sort((a, b) => a.order_index - b.order_index);
            let newPerformerPositions = s.performerPositions;
            let newPropPositions = s.propPositions;
            if (pp) {
              newPerformerPositions = { ...s.performerPositions };
              for (const p of pp) {
                const k = `${p.performerId}-${p.formationId}`;
                newPerformerPositions[k] = { ...newPerformerPositions[k], performer_id: p.performerId, formation_id: p.formationId, x: p.x, y: p.y };
              }
            }
            if (prp) {
              newPropPositions = { ...s.propPositions };
              for (const p of prp) {
                const k = `${p.propId}-${p.formationId}`;
                newPropPositions[k] = { ...newPropPositions[k], prop_id: p.propId, formation_id: p.formationId, x: p.x, y: p.y };
              }
            }
            return { formations: newFormations, performerPositions: newPerformerPositions, propPositions: newPropPositions };
          });
        }

        // Formation delete
        if (payload.formationDelete) {
          const id = payload.formationDelete;
          useShowStore.setState(s => ({
            formations: s.formations
              .filter(f => f.id !== id)
              .map((f, i) => ({ ...f, order_index: i })),
          }));
        }

        // Formation reorder
        if (payload.formationsReorder) {
          const orderMap = new Map(payload.formationsReorder.map(f => [f.id, f.order_index]));
          useShowStore.setState(s => ({
            formations: s.formations
              .map(f => orderMap.has(f.id) ? { ...f, order_index: orderMap.get(f.id)! } : f)
              .sort((a, b) => a.order_index - b.order_index),
          }));
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          if (wasDisconnectedRef.current) {
            // Reconnected after a real drop — re-fetch to catch missed changes
            wasDisconnectedRef.current = false;
            useShowStore.getState().loadShow(showId);
          }
          useShowStore.getState().setRealtimeConnected(true);

          // Join as collaborator in the DB — reliable fallback for the online indicator
          // when Supabase Realtime Presence policies aren't set up.
          const state = useShowStore.getState();
          const color = state.localUserColor || colorFromUserId(state.localUserId);
          await supabase.from('collaborators').upsert({
            show_id: showId,
            user_id: state.localUserId,
            name: state.localUserName,
            color,
            last_seen: new Date().toISOString(),
          }, { onConflict: 'show_id,user_id' });

          // Fetch current collaborators from DB — only those seen in the last 2 minutes
          // (guards against stale rows left by crashed/closed sessions)
          const recentCutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
          const { data } = await supabase
            .from('collaborators')
            .select('*')
            .eq('show_id', showId)
            .neq('user_id', state.localUserId)
            .gte('last_seen', recentCutoff);
          if (data && data.length > 0) {
            // Mark pre-existing collaborators as known so their arrival doesn't trigger toasts
            data.forEach((c: any) => knownUserIdsRef.current.add(c.user_id));
            useShowStore.setState(s => {
              const existingIds = new Set(s.collaborators.map(c => c.user_id));
              const newOnes = data.filter((c: any) => !existingIds.has(c.user_id));
              return newOnes.length > 0 ? { collaborators: [...s.collaborators, ...newOnes] } : s;
            });
          }

          // Broadcast our current formation/playhead so late-joiners see us immediately
          const fresh = useShowStore.getState();
          const sorted = [...fresh.formations].sort((a, b) => a.order_index - b.order_index);
          let startTime = 0;
          for (const f of sorted) {
            if (f.id === fresh.activeFormationId) break;
            startTime += f.duration;
          }
          broadcastEphemeral({ activeFormationId: fresh.activeFormationId, playheadTime: startTime });
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          wasDisconnectedRef.current = true;
          useShowStore.getState().setRealtimeConnected(false);
        }
      });

    channelRef.current = channel;

    // ── Presence channel (secondary — works if Realtime Authorization is configured) ──
    const presence = supabase.channel(`presence-${showId}`, {
      config: { presence: { key: useShowStore.getState().localUserId } },
    });

    presence
      .on('presence', { event: 'sync' }, () => {
        const presenceState = presence.presenceState<PresenceState>();
        const localId = useShowStore.getState().localUserId;
        const presenceMap = new Map(
          Object.values(presenceState)
            .flat()
            .filter(p => p.userId !== localId)
            .map(p => [p.userId, p])
        );
        if (presenceMap.size === 0) return; // Don't wipe DB-sourced list on empty Presence state
        // Merge ephemeral fields into existing collaborators without replacing the list
        useShowStore.setState(s => ({
          collaborators: s.collaborators.map(c => {
            const p = presenceMap.get(c.user_id);
            return p ? { ...c, cursor_x: p.cursorX, cursor_y: p.cursorY, active_formation_id: p.activeFormationId, playhead_time: p.playheadTime } : c;
          }),
        }));
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        const localId = useShowStore.getState().localUserId;
        for (const p of newPresences as unknown as PresenceState[]) {
          if (p.userId === localId) continue;
          // knownUserIdsRef guards against double-toasting when both DB and Presence fire
          if (!knownUserIdsRef.current.has(p.userId)) {
            knownUserIdsRef.current.add(p.userId);
            useShowStore.getState().addToast(`${p.name} joined the session`, 'info');
          }
        }
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        const localId = useShowStore.getState().localUserId;
        for (const p of leftPresences as unknown as PresenceState[]) {
          if (p.userId === localId) continue;
          if (knownUserIdsRef.current.has(p.userId)) {
            knownUserIdsRef.current.delete(p.userId);
            useShowStore.getState().addToast(`${p.name} left the session`, 'info');
          }
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          const state = useShowStore.getState();
          await presence.track({
            userId: state.localUserId,
            name: state.localUserName,
            color: state.localUserColor || '#7c3aed',
            activeFormationId: state.activeFormationId,
            online_at: new Date().toISOString(),
          } satisfies PresenceState);
        }
      });

    presenceChannelRef.current = presence;

    return () => {
      clearInterval(heartbeatInterval);
      const { localUserId } = useShowStore.getState();
      if (localUserId) {
        supabase.from('collaborators').delete().eq('show_id', showId).eq('user_id', localUserId);
      }
      channel.unsubscribe();
      presence.unsubscribe();
      channelRef.current = null;
      presenceChannelRef.current = null;
      knownUserIdsRef.current = new Set();
    };
  }, [showId, broadcastEphemeral]);
}
