/**
 * useServiceStatus – shared hook that polls the backend health endpoint
 * and exposes the current service status.
 *
 * Consumed by:
 *  • ServiceStatusBanner – shows warning banners
 *  • TopUtilityBar (via FCanvas) – colours the sync indicator dot
 */

import { useState, useEffect, useCallback, useRef } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export type ServiceStatus = 'ok' | 'backend-down' | 'db-down';

export function useServiceStatus(intervalMs = 30_000): ServiceStatus {
  const [status, setStatus] = useState<ServiceStatus>('ok');
  const mountedRef = useRef(true);

  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error('non-200');

      const body = await res.json();

      if (body.dbConnected === false) {
        if (mountedRef.current) setStatus(prev => (prev === 'db-down' ? prev : 'db-down'));
        return;
      }

      // Quick DB probe
      const dbProbe = await fetch(`${API_BASE}/api/projects`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!dbProbe.ok) {
        if (mountedRef.current) setStatus(prev => (prev === 'db-down' ? prev : 'db-down'));
        return;
      }

      const dbBody = await dbProbe.json();
      if (dbBody.success === false && /database|connect|postgres|docker/i.test(dbBody.error ?? '')) {
        if (mountedRef.current) setStatus(prev => (prev === 'db-down' ? prev : 'db-down'));
        return;
      }

      // Everything healthy
      if (mountedRef.current) setStatus(prev => (prev === 'ok' ? prev : 'ok'));
    } catch {
      if (mountedRef.current) setStatus(prev => (prev === 'backend-down' ? prev : 'backend-down'));
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    checkHealth();
    const id = setInterval(checkHealth, intervalMs);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [checkHealth, intervalMs]);

  return status;
}
