import { useState, useEffect, useRef } from 'react';
import { useServiceStatus } from '../hooks/useServiceStatus';
import type { ServiceStatus } from '../hooks/useServiceStatus';

export type { ServiceStatus };

/**
 * Non-blocking banner that warns users when the backend or database is
 * unavailable.  Consumes the shared useServiceStatus hook so the same
 * health state can also drive the sync indicator in TopUtilityBar.
 */
export default function ServiceStatusBanner() {
  const status = useServiceStatus();
  const [dismissed, setDismissed] = useState(false);
  const prevStatusRef = useRef(status);

  // Re-show banner whenever the status *changes* (e.g. ok → db-down)
  useEffect(() => {
    if (prevStatusRef.current !== status) {
      setDismissed(false);
      prevStatusRef.current = status;
    }
  }, [status]);

  if (status === 'ok' || dismissed) return null;

  const isBackendDown = status === 'backend-down';

  return (
    <div className="fixed top-0 inset-x-0 z-[9999] flex justify-center pointer-events-none">
      <div
        className={`
          mt-4 mx-4 max-w-2xl w-full rounded-xl shadow-2xl pointer-events-auto
          border backdrop-blur-md px-5 py-4
          ${isBackendDown
            ? 'bg-red-950/90 border-red-700/60 text-red-100'
            : 'bg-amber-950/90 border-amber-600/60 text-amber-100'}
        `}
        role="alert"
      >
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className="flex-shrink-0 mt-0.5">
            {isBackendDown ? (
              <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
            ) : (
              <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
              </svg>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">
              {isBackendDown ? 'Backend Server Unavailable' : 'Database Unavailable'}
            </p>
            <p className="text-sm mt-1 opacity-90 leading-relaxed">
              {isBackendDown ? (
                <>
                  Cannot reach the backend server. Collaborative features, project saving,
                  and AI generation are currently offline.
                </>
              ) : (
                <>
                  The server is running but the database (PostgreSQL / Docker) is unreachable.
                  Projects cannot be saved or loaded.
                </>
              )}
            </p>
            <p className="text-sm mt-2 opacity-75">
              <strong>Tip:</strong> You can still draw on the canvas and use{' '}
              <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-xs font-mono">File &rarr; Export</kbd>{' '}
              to save your work locally as an image.
            </p>
          </div>

          {/* Dismiss */}
          <button
            onClick={() => setDismissed(true)}
            className={`
              flex-shrink-0 rounded-lg p-1.5 transition-colors
              ${isBackendDown
                ? 'hover:bg-red-800/60 text-red-300 hover:text-red-100'
                : 'hover:bg-amber-800/60 text-amber-300 hover:text-amber-100'}
            `}
            aria-label="Dismiss"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
