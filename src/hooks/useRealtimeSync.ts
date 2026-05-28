import { useEffect, useRef, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useShowStore } from '../store/showStore';

interface FormationUpsert {
  id: string; show_id: string; name: string; notes: string;
  duration: number; transition_duration: number; transition_easing: string; order_index: number;
  performerPositions?: { performerId: string; formationId: string; x: number; y: number }[];
  propPositions?: { propId: string; formationId: string; x: number; y: number }[];
}

interface PositionUpdate {
  type: 'performer' | 'prop';
  id: string;
  formationId: string;
  x: number;
  y: number;
}

interface EphemeralPayload {
  userId: string;
  activeFormationId?: string | null;
  formationUpsert?: FormationUpsert;
  formationDelete?: string;
  formationsReorder?: { id: string; order_index: number }[];
  positionUpdates?: PositionUpdate[];
}

export function useRealtimeSync(showId: string | null) {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const knownUserIdsRef = useRef<Set<string>>(new Set());
  const wasDisconnectedRef = useRef(false);

  // Only broadcast when other collaborators are online — skip if solo.
  const broadcastEphemeral = useCallback((data: Omit<EphemeralPayload, 'userId'>) => {
    if (!channelRef.current) return;
    const state = useShowStore.getState();
    if (state.collaborators.filter(c => c.user_id !== state.localUserId).length === 0) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'ephemeral',
      payload: { userId: state.localUserId, ...data } satisfies EphemeralPayload,
    });
  }, []);

  // Expose formation broadcast globals so store actions can call them directly.
  useEffect(() => {
    (window as any).__spotlineBroadcastFormation = (formationId: string | null) => {
      broadcastEphemeral({ activeFormationId: formationId });
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
    (window as any).__spotlineBroadcastPositions = (updates: PositionUpdate[]) => {
      if (updates.length > 0) broadcastEphemeral({ positionUpdates: updates });
    };
    return () => {
      delete (window as any).__spotlineBroadcastFormation;
      delete (window as any).__spotlineBroadcastFormationUpsert;
      delete (window as any).__spotlineBroadcastFormationDelete;
      delete (window as any).__spotlineBroadcastFormationsReorder;
      delete (window as any).__spotlineBroadcastPositions;
    };
  }, [broadcastEphemeral]);

  // Broadcast activeFormationId only when it actually changes.
  useEffect(() => {
    let prev = useShowStore.getState().activeFormationId;
    const unsub = useShowStore.subscribe((state) => {
      if (state.activeFormationId !== prev) {
        prev = state.activeFormationId;
        broadcastEphemeral({ activeFormationId: state.activeFormationId });
      }
    });
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
      // Receive ephemeral updates from other clients via Broadcast.
      .on('broadcast', { event: 'ephemeral' }, ({ payload }: { payload: EphemeralPayload }) => {
        if (!payload?.userId) return;
        const localId = useShowStore.getState().localUserId;
        if (payload.userId === localId) return;

        // Update active formation indicator
        if (payload.activeFormationId !== undefined) {
          useShowStore.setState(s => ({
            collaborators: s.collaborators.map(c =>
              c.user_id === payload.userId
                ? { ...c, active_formation_id: payload.activeFormationId }
                : c
            ),
          }));
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

        // Position updates (drag end)
        if (payload.positionUpdates?.length) {
          useShowStore.setState(s => {
            const newPerfPositions = { ...s.performerPositions };
            const newPropPositions = { ...s.propPositions };
            for (const u of payload.positionUpdates!) {
              const k = `${u.id}-${u.formationId}`;
              if (u.type === 'performer') {
                newPerfPositions[k] = { ...newPerfPositions[k], performer_id: u.id, formation_id: u.formationId, x: u.x, y: u.y };
              } else {
                newPropPositions[k] = { ...newPropPositions[k], prop_id: u.id, formation_id: u.formationId, x: u.x, y: u.y };
              }
            }
            return { performerPositions: newPerfPositions, propPositions: newPropPositions };
          });
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          if (wasDisconnectedRef.current) {
            wasDisconnectedRef.current = false;
            useShowStore.getState().loadShow(showId);
          }
          useShowStore.getState().setRealtimeConnected(true);

          const state = useShowStore.getState();
          const color = '#7c3aed';
          await supabase.from('collaborators').upsert({
            show_id: showId,
            user_id: state.localUserId,
            name: state.localUserName,
            color,
            last_seen: new Date().toISOString(),
          }, { onConflict: 'show_id,user_id' });

          // Fetch current collaborators from DB — only those seen in the last 2 minutes
          const recentCutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
          const { data } = await supabase
            .from('collaborators')
            .select('*')
            .eq('show_id', showId)
            .neq('user_id', state.localUserId)
            .gte('last_seen', recentCutoff);
          if (data && data.length > 0) {
            data.forEach((c: any) => knownUserIdsRef.current.add(c.user_id));
            useShowStore.setState(s => {
              const existingIds = new Set(s.collaborators.map(c => c.user_id));
              const newOnes = data.filter((c: any) => !existingIds.has(c.user_id));
              return newOnes.length > 0 ? { collaborators: [...s.collaborators, ...newOnes] } : s;
            });
          }

          // Broadcast our current formation so late-joiners see us immediately
          const fresh = useShowStore.getState();
          broadcastEphemeral({ activeFormationId: fresh.activeFormationId });
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          wasDisconnectedRef.current = true;
          useShowStore.getState().setRealtimeConnected(false);
        }
      });

    channelRef.current = channel;

    return () => {
      clearInterval(heartbeatInterval);
      const { localUserId } = useShowStore.getState();
      if (localUserId) {
        supabase.from('collaborators').delete().eq('show_id', showId).eq('user_id', localUserId);
      }
      channel.unsubscribe();
      channelRef.current = null;
      knownUserIdsRef.current = new Set();
    };
  }, [showId, broadcastEphemeral]);
}
