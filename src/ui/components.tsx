import type { PropsWithChildren, ButtonHTMLAttributes, InputHTMLAttributes } from 'react';

export function Card({ children, className = '' }: PropsWithChildren<{ className?: string }>) {
  return <section className={`rounded-card bg-white p-4 shadow-soft ${className}`}>{children}</section>;
}

export function Button({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white active:scale-[0.99] disabled:opacity-40 ${className}`}
    />
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm ${props.className ?? ''}`} />;
}

export function Toggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} className={`h-7 w-12 rounded-full p-1 ${checked ? 'bg-gray-900' : 'bg-gray-300'}`}>
      <span className={`block h-5 w-5 rounded-full bg-white transition ${checked ? 'translate-x-5' : ''}`} />
    </button>
  );
}

export function EmptyState({ title, desc }: { title: string; desc: string }) {
  return <Card className="text-center"><h3 className="font-semibold">{title}</h3><p className="text-sm text-gray-500">{desc}</p></Card>;
}
