import type { PropsWithChildren, ButtonHTMLAttributes, InputHTMLAttributes } from 'react';
import { theme } from '../config/theme';

export function Card({ children, className = '' }: PropsWithChildren<{ className?: string }>) {
  return <section className={`rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition hover:shadow-soft sm:p-4 ${className}`}>{children}</section>;
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export function Button({ className = '', variant = 'primary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const variantClass = variant === 'primary'
    ? theme.primaryColorClass
    : variant === 'secondary'
      ? 'border border-gray-300 bg-white text-gray-800 hover:bg-gray-50'
      : 'bg-transparent text-gray-700 hover:bg-gray-100';

  return (
    <button
      {...props}
      className={`rounded-xl px-4 py-3 text-sm font-semibold transition active:scale-[0.99] disabled:opacity-40 sm:py-2.5 ${variantClass} ${className}`}
    />
  );
}

export function Badge({ children, className = '' }: PropsWithChildren<{ className?: string }>) {
  return <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${theme.accentColorClass} ${className}`}>{children}</span>;
}

export function SegmentedControl<T extends string>({ options, value, onChange }: { options: Array<{ label: string; value: T }>; value: T; onChange: (value: T) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:auto-cols-fr sm:grid-flow-col sm:overflow-visible">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`min-w-[110px] whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium sm:min-w-0 ${value === option.value ? 'bg-white text-gray-900 shadow' : 'text-gray-600'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, title, onClose, children }: PropsWithChildren<{ open: boolean; title: string; onClose: () => void }>) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 grid place-items-end bg-black/30 p-4 sm:place-items-center">
      <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-soft">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="text-sm text-gray-500">Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm ${props.className ?? ''}`} />;
}

export function Toggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className={`h-7 w-12 rounded-full p-1 ${checked ? 'bg-emerald-700' : 'bg-gray-300'}`}>
      <span className={`block h-5 w-5 rounded-full bg-white transition ${checked ? 'translate-x-5' : ''}`} />
    </button>
  );
}

export function EmptyState({ title, desc }: { title: string; desc: string }) {
  return <Card className="text-center"><h3 className="font-semibold">{title}</h3><p className="text-sm text-gray-500">{desc}</p></Card>;
}
