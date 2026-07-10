import { useCallback, useEffect, useState } from 'react';

/** Thin typed client for the QE.ai API. Demo auth token is the acting user. */

const BASE = import.meta.env.VITE_API_URL ?? '';

export function actingUser(): string {
  return localStorage.getItem('qeai.actingUser') ?? 'admin';
}

export function setActingUser(userId: string): void {
  localStorage.setItem('qeai.actingUser', userId);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer demo-${actingUser()}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
};

export interface Loaded<T> {
  data: T | undefined;
  error: string | undefined;
  loading: boolean;
  reload: () => void;
}

/** Fetch-on-mount hook with manual reload. */
export function useApi<T>(path: string, deps: unknown[] = []): Loaded<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<T>(path)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setError(undefined);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tick, ...deps]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}
