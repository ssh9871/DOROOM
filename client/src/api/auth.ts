export type DemoAccount = { loginId: string; nickname: string };
export type AccountUser = {
  userId: number;
  loginId: string;
  cellBalance: number;
  equippedTitle: { titleId: number; code: string; name: string } | null;
};
type Session = { token: string; user: AccountUser };
type ApiResult<T> = { ok: true; data: T } | { ok: false; error: { message: string } };

const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const sessionKey = 'doroom.auth-token';

function storeToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(sessionKey, token);
    else sessionStorage.removeItem(sessionKey);
  } catch {
    // Storage can be unavailable. The signed-in user stays in memory until reload.
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(baseUrl + path, { signal: AbortSignal.timeout(5000), ...options });
  const result: ApiResult<T> = await response.json();
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

export function listDemoAccounts() {
  return request<DemoAccount[]>('/auth/demo-accounts');
}

export async function loginWithDemoAccount(loginId: string) {
  const { token, user } = await request<Session>('/auth/demo-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginId }),
  });
  storeToken(token);
  return user;
}

export async function restoreAccount() {
  try {
    const token = sessionStorage.getItem(sessionKey);
    if (token) return await request<AccountUser>('/me', { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    storeToken(null);
  }
  return null;
}

export function clearAccount() {
  storeToken(null);
}
