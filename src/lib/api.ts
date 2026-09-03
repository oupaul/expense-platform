const API_BASE = "/api";

export class ApiError extends Error {}

export async function apiFetch<T>(
  path: string,
  options: { method?: string; token?: string | null; body?: unknown } = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => undefined);
  if (!res.ok) {
    const message = data?.error && typeof data.error === "string" ? data.error : `請求失敗 (${res.status})`;
    throw new ApiError(message);
  }
  return data as T;
}
