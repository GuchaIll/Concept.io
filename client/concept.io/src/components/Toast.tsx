import { useState, useCallback, useRef, useEffect } from 'react';

export interface ToastMessage {
  id: string;
  message: string;
  type: 'warning' | 'error' | 'info' | 'success';
  duration?: number; // ms, default 3000
}

/**
 * Lightweight toast notification system for layer constraint warnings etc.
 */
export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const addToast = useCallback((message: string, type: ToastMessage['type'] = 'warning', duration = 3000) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const toast: ToastMessage = { id, message, type, duration };

    setToasts(prev => {
      // Prevent duplicate consecutive messages
      if (prev.length > 0 && prev[prev.length - 1].message === message) {
        return prev;
      }
      // Cap at 3 visible toasts
      const next = [...prev, toast];
      return next.slice(-3);
    });

    // Auto-remove after duration
    const timer = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      timersRef.current.delete(id);
    }, duration);
    timersRef.current.set(id, timer);

    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach(timer => clearTimeout(timer));
      timersRef.current.clear();
    };
  }, []);

  return { toasts, addToast, removeToast };
}

const TOAST_COLORS: Record<ToastMessage['type'], { bg: string; border: string; icon: string }> = {
  warning: { bg: 'rgba(245, 158, 11, 0.95)', border: '#f59e0b', icon: '⚠' },
  error: { bg: 'rgba(239, 68, 68, 0.95)', border: '#ef4444', icon: '✕' },
  info: { bg: 'rgba(59, 130, 246, 0.95)', border: '#3b82f6', icon: 'ℹ' },
  success: { bg: 'rgba(16, 185, 129, 0.95)', border: '#10b981', icon: '✓' },
};

interface ToastContainerProps {
  toasts: ToastMessage[];
  onRemove: (id: string) => void;
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 60,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 10000,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8,
      pointerEvents: 'none',
    }}>
      {toasts.map(toast => {
        const colors = TOAST_COLORS[toast.type];
        return (
          <div
            key={toast.id}
            style={{
              background: colors.bg,
              border: `1px solid ${colors.border}`,
              borderRadius: 8,
              padding: '10px 18px',
              color: '#fff',
              fontSize: 13,
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
              pointerEvents: 'auto',
              cursor: 'pointer',
              animation: 'toast-slide-in 0.2s ease-out',
              maxWidth: 500,
            }}
            onClick={() => onRemove(toast.id)}
          >
            <span style={{ fontSize: 16 }}>{colors.icon}</span>
            <span>{toast.message}</span>
          </div>
        );
      })}
      <style>{`
        @keyframes toast-slide-in {
          from { opacity: 0; transform: translateY(-12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
