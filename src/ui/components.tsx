import { useEffect, useRef, useState, type PropsWithChildren, type InputHTMLAttributes } from 'react';
import { AnimatePresence, motion, type HTMLMotionProps } from 'framer-motion';
import { createPortal } from 'react-dom';
import { theme } from '../config/theme';
import { useI18n } from '../app/i18n';

export function Card({ children, className = '' }: PropsWithChildren<{ className?: string }>) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.08 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className={`rounded-2xl border border-white/70 bg-white/78 p-3 shadow-[0_14px_36px_rgba(15,23,42,0.09)] backdrop-blur-sm transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(15,23,42,0.13)] sm:p-4 ${className}`}
    >
      {children}
    </motion.section>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export function Button({ className = '', variant = 'primary', ...props }: HTMLMotionProps<'button'> & { variant?: ButtonVariant }) {
  const variantClass =
    variant === 'primary'
      ? theme.primaryColorClass
      : variant === 'secondary'
        ? 'border border-slate-200/80 bg-white/90 text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] hover:bg-slate-50'
        : 'bg-transparent text-slate-600 hover:bg-slate-100/70';

  return (
    <motion.button
      {...props}
      whileTap={{ scale: 0.98 }}
      className={`rounded-xl px-4 py-3 text-sm font-semibold transition active:scale-[0.99] disabled:opacity-40 sm:py-2.5 ${variantClass} ${className}`}
    />
  );
}

export function Badge({ children, className = '' }: PropsWithChildren<{ className?: string }>) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${theme.accentColorClass} ${className}`}
    >
      {children}
    </span>
  );
}

export function SegmentedControl<T extends string>({ options, value, onChange }: { options: Array<{ label: string; value: T }>; value: T; onChange: (value: T) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200/80 bg-white/70 p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:auto-cols-fr sm:grid-flow-col sm:overflow-visible">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`min-w-[110px] whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium sm:min-w-0 ${value === option.value ? 'bg-gradient-to-r from-cyan-500 to-sky-500 text-white shadow-[0_8px_18px_rgba(14,165,233,0.32)]' : 'text-slate-600 hover:bg-slate-100/80'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, title, onClose, children }: PropsWithChildren<{ open: boolean; title: string; onClose: () => void }>) {
  const { t } = useI18n();
  if (typeof document === 'undefined') return null;

  return createPortal((
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-40 grid place-items-end bg-slate-950/55 p-4 backdrop-blur-[1px] sm:place-items-center"
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-[0_28px_70px_rgba(2,6,23,0.38)]"
          >
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">{title}</h3>
              <button onClick={onClose} className="text-sm text-slate-500">{t('buttons.close')}</button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  ), document.body);
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-100 ${props.className ?? ''}`}
    />
  );
}

export function Toggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.97 }}
      onClick={() => onChange(!checked)}
      className={`h-7 w-12 rounded-full p-1 transition ${checked ? 'bg-cyan-500' : 'bg-slate-300'}`}
    >
      <span className={`block h-5 w-5 rounded-full bg-white transition ${checked ? 'translate-x-5' : ''}`} />
    </motion.button>
  );
}

export function EmptyState({ title, desc }: { title: string; desc: string }) {
  return <Card className="text-center"><h3 className="font-semibold">{title}</h3><p className="text-sm text-slate-500">{desc}</p></Card>;
}

export function AnimatedNumber({
  value,
  className = '',
  decimals = 0,
  suffix = '',
}: {
  value: number;
  className?: string;
  decimals?: number;
  suffix?: string;
}) {
  const [display, setDisplay] = useState(value);
  const displayRef = useRef(value);

  useEffect(() => {
    const from = displayRef.current;
    const to = value;
    if (from === to) return;
    const durationMs = 350;
    let frameId = 0;
    let startAt = 0;

    const tick = (timestamp: number) => {
      if (!startAt) startAt = timestamp;
      const elapsed = Math.min(1, (timestamp - startAt) / durationMs);
      const eased = 1 - Math.pow(1 - elapsed, 3);
      const next = from + (to - from) * eased;
      displayRef.current = next;
      setDisplay(next);
      if (elapsed < 1) frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [value]);

  return (
    <motion.span className={className}>
      {display.toFixed(decimals)}
      {suffix}
    </motion.span>
  );
}
