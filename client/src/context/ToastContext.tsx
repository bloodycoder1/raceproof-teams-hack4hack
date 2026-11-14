import React, { createContext, useContext, useState, useCallback } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'conflict' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

interface ToastContextType {
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = `toast-${Date.now()}-${Math.random()}`;
      setToasts((prev) => [...prev, { ...toast, id }]);
      setTimeout(() => {
        removeToast(id);
      }, 5000);
    },
    [removeToast],
  );

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <div
        aria-live="polite"
        role="status"
        className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-md w-full pointer-events-none px-4"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl shadow-2xl border transition-all duration-300 transform translate-y-0 ${
              t.type === 'success'
                ? 'bg-emerald-950/90 text-emerald-200 border-emerald-800'
                : t.type === 'conflict'
                ? 'bg-amber-950/90 text-amber-200 border-amber-800 animate-pulse'
                : t.type === 'error'
                ? 'bg-rose-950/90 text-rose-200 border-rose-800'
                : 'bg-slate-800/90 text-slate-200 border-slate-700'
            }`}
          >
            <div className="shrink-0 mt-0.5">
              {t.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
              {t.type === 'conflict' && <AlertCircle className="w-5 h-5 text-amber-400" />}
              {t.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-400" />}
              {t.type === 'info' && <Info className="w-5 h-5 text-blue-400" />}
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-sm leading-tight">{t.title}</h4>
              {t.message && <p className="text-xs mt-1 opacity-90">{t.message}</p>}
            </div>
            <button
              onClick={() => removeToast(t.id)}
              className="shrink-0 opacity-70 hover:opacity-100 p-1 rounded focus-visible:ring-1 focus-visible:ring-white"
              aria-label="Close notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}
