/**
 * React bindings for the GameController contract (src/game/api.ts).
 */
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import type { ControllerSnapshot, GameController } from '../game/api';
import type { GameEvent } from '../engine/types';

/**
 * Subscribe to the controller via useSyncExternalStore. `getServerSnapshot`
 * is provided so the UI can render under react-dom/server (smoke tests, SSR).
 */
export function useControllerSnapshot(controller: GameController): ControllerSnapshot {
  const subscribe = useCallback((listener: () => void) => controller.subscribe(listener), [controller]);
  const getSnapshot = useCallback(() => controller.getSnapshot(), [controller]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Subscribe to transient GameEvents (animations, SFX). */
export function useGameEvents(
  controller: GameController,
  handler: (event: GameEvent) => void,
): void {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);
  useEffect(() => controller.onEvent((event) => handlerRef.current(event)), [controller]);
}
