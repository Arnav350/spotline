import { useEffect, useRef, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useShowStore } from '../store/showStore';
import { colorFromUserId } from '../lib/colors';

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

interface PresencePayload {
  userId: string;
  name: string;
  color: string;
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

    // Only process DB events when others are online — avoids echo-processing our own saves when solo
    function hasPeers(): boolean {
      const { collaborators, localUserId } = useShowStore.getState();
      return collaborators.some(c => c.user_id !== localUserId);
    }

    const channel = supabase.channel(`show-${showId}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shows', filter: `id=eq.${showId}` }, payload => {
        if (!hasPeers()) return;
        if (payload.eventType === 'UPDATE' && payload.new) {
          const current = useShowStore.getState().show;
          if (current && payload.new.updated_at > (current.updated_at || '')) {
            useShowStore.setState({ show: payload.new as any });
          }
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'formations', filter: `show_id=eq.${showId}` }, payload => {
        if (!hasPeers()) return;
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
        if (!hasPeers()) return;
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
        if (!hasPeers()) return;
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
      // Presence: who is currently online in this show
      .on('presence', { event: 'sync' }, () => {
        const presenceState = channel.presenceState<PresencePayload>();
        const localId = useShowStore.getState().localUserId;
        // Preserve ephemeral active_formation_id values set by broadcast
        const existingById = new Map(useShowStore.getState().collaborators.map(c => [c.user_id, c]));
        const collaborators = Object.values(presenceState)
          .flat()
          .filter(p => p.userId !== localId)
          .map(p => ({
            user_id: p.userId,
            name: p.name,
            color: p.color,
            active_formation_id: existingById.get(p.userId)?.active_formation_id ?? null,
          }));
        useShowStore.setState({ collaborators });
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        const localId = useShowStore.getState().localUserId;
        for (const p of newPresences as unknown as PresencePayload[]) {
          if (p.userId === localId) continue;
          if (!knownUserIdsRef.current.has(p.userId)) {
            knownUserIdsRef.current.add(p.userId);
            useShowStore.getState().addToast(`${p.name} joined the session`, 'info');
          }
        }
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        const localId = useShowStore.getState().localUserId;
        for (const p of leftPresences as unknown as PresencePayload[]) {
          if (p.userId === localId) continue;
          useShowStore.getState().addToast(`${p.name} left the session`, 'info');
          knownUserIdsRef.current.delete(p.userId);
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
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (wasDisconnectedRef.current) {
            wasDisconnectedRef.current = false;
            useShowStore.getState().loadShow(showId);
          }
          useShowStore.getState().setRealtimeConnected(true);

          // Announce our presence to others — but only if the user identity has
          // resolved. If still at the 'Anonymous' default (profile not loaded yet),
          // skip here: the store subscriber above fires track() once setLocalUser()
          // resolves the real profile, ensuring we never broadcast 'Anonymous' to peers.
          const state = useShowStore.getState();
          if (state.localUserName !== 'Anonymous') {
            channel.track({
              userId: state.localUserId,
              name: state.localUserName,
              color: colorFromUserId(state.localUserId),
            });
          }

          // Broadcast our current formation so late-joiners see us immediately
          broadcastEphemeral({ activeFormationId: useShowStore.getState().activeFormationId });
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          wasDisconnectedRef.current = true;
          useShowStore.getState().setRealtimeConnected(false);
        }
      });

    channelRef.current = channel;

    return () => {
      channel.untrack();
      channel.unsubscribe();
      channelRef.current = null;
      knownUserIdsRef.current = new Set();
      useShowStore.setState({ collaborators: [] });
    };
  }, [showId, broadcastEphemeral]);
}
