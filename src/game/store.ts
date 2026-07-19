import { useCallback, useSyncExternalStore } from 'react';
import type { ControllerSnapshot, GameController } from './api';

/**
 * React binding for the controller: subscribes via useSyncExternalStore and returns
 * the current snapshot. Re-renders the component on every controller state change.
 * The third argument is the SSR snapshot — the controller's snapshot is immutable,
 * so the same getter serves both client and server rendering.
 */
export function useControllerSnapshot(controller: GameController): ControllerSnapshot {
  const subscribe = useCallback(
    (listener: () => void) => controller.subscribe(listener),
    [controller],
  );
  const getSnapshot = useCallback(() => controller.getSnapshot(), [controller]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
