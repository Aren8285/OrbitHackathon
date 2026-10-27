'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * Poll an async action using a stable onComplete callback ref.
 *
 * The callback is stored in a ref and re-run whenever the deps change, so the
 * UI can react to data arriving from the backend without re-subscribing.
 */
export function useActionPoll(
  deps: unknown[],
  onComplete: () => Promise<void> | void,
  { intervalMs = 0, enabled = true }: { intervalMs?: number; enabled?: boolean } = {},
) {
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(() => {
    if (!enabled) return;
    onCompleteRef.current().catch(() => {
      /* action-owned retry policy */
    });
  }, [enabled]);

  const startPolling = useCallback(() => {
    if (!enabled || intervalMs <= 0) return;
    if (intervalRef.current) return;
    intervalRef.current = setInterval(run, intervalMs);
  }, [enabled, intervalMs, run]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (runRef.current) {
      clearTimeout(runRef.current);
      runRef.current = null;
    }
  }, []);

  const runOnce = useCallback(() => {
    stopPolling();
    run();
  }, [run, stopPolling]);

  useEffect(() => {
    if (enabled && intervalMs > 0) {
      startPolling();
    }
    return stopPolling;
  }, [enabled, intervalMs, startPolling, stopPolling]);

  return { run, runOnce, startPolling, stopPolling };
}

/**
 * Keep a React query "live" by re-fetching when a deps value changes.
 *
 * This is a thin wrapper around useEffect + onComplete. Invert the deps shape
 * when the backend emits data through a separate channel (e.g. SSE / polling
 * for simulation completions).
 */
export function useLiveRevalidation(deps: unknown[], onComplete: () => Promise<void> | void) {
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    onCompleteRef.current().catch(() => {
      /* caller owns error handling */
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
