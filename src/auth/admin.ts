export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;

  const allowlist = (import.meta.env.VITE_ADMIN_EMAILS ?? '')
    .split(',')
    .map((entry: string) => entry.trim().toLowerCase())
    .filter(Boolean);

  if (allowlist.length === 0) return false;
  return allowlist.includes(email.trim().toLowerCase());
}
