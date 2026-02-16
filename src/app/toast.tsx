import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react';

interface ToastState {
  id: string;
  message: string;
}

interface ToastContextValue {
  showToast: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: PropsWithChildren) {
  const [toast, setToast] = useState<ToastState | null>(null);

  const value = useMemo(() => ({
    showToast: (message: string) => {
      const id = crypto.randomUUID();
      setToast({ id, message });
      window.setTimeout(() => {
        setToast((current) => (current?.id === id ? null : current));
      }, 2500);
    },
  }), []);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <div className="fixed left-1/2 top-4 z-50 w-[90%] max-w-md -translate-x-1/2 rounded-xl bg-gray-900 px-4 py-3 text-sm text-white shadow-soft">
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
