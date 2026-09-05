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

// 上傳憑證附件用 multipart/form-data，不能走上面 apiFetch 的 JSON.stringify 路徑；
// 也不能手動設 Content-Type，瀏覽器要自己加上 multipart 的 boundary 參數。
export async function apiUpload<T>(path: string, files: File[], token: string | null): Promise<T> {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: formData,
  });
  const data = await res.json().catch(() => undefined);
  if (!res.ok) {
    const message = data?.error && typeof data.error === "string" ? data.error : `請求失敗 (${res.status})`;
    throw new ApiError(message);
  }
  return data as T;
}

// 憑證附件需要登入才能看，不能直接用 <img src="...">(無法帶 Authorization header)，
// 也不想把 token 塞進網址(會留在瀏覽器歷史記錄、referrer、伺服器 log 裡)。
// 改用帶 header 的 fetch 把檔案拉回來，轉成本機 blob: URL 給 <img>/新分頁使用。
export async function apiFetchBlobUrl(path: string, token: string | null): Promise<string> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) throw new ApiError(`請求失敗 (${res.status})`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
