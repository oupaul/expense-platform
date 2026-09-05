const API_BASE = "/api";
// 上限給寬鬆一點，手機拍照配上比較差的行動網路，多檔上傳(最多 5 個、單檔 10MB)
// 真的可能要傳好一陣子；重點是「有上限」，不會像之前那樣卡在「送出中」卡到天荒地老都等不到結果。
const FETCH_TIMEOUT_MS = 120_000;

export class ApiError extends Error {}

// 統一在這裡加逾時保護：網路斷線、伺服器/反向代理中途把連線掐斷(例如 nginx 檔案大小
// 限制擋掉還沒送完的上傳)等情況，fetch() 有時不會乾脆地 reject，而是整個吊在那裡沒反應。
// 加上 AbortController 逾時，確保呼叫端一定會在有限時間內拿到成功或明確的錯誤。
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError("請求逾時，請確認網路連線後再試一次");
    }
    throw new ApiError("網路連線失敗，請確認網路連線後再試一次");
  } finally {
    clearTimeout(timer);
  }
}

export async function apiFetch<T>(
  path: string,
  options: { method?: string; token?: string | null; body?: unknown } = {}
): Promise<T> {
  const res = await fetchWithTimeout(`${API_BASE}${path}`, {
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
  const res = await fetchWithTimeout(`${API_BASE}${path}`, {
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
  const res = await fetchWithTimeout(`${API_BASE}${path}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) throw new ApiError(`請求失敗 (${res.status})`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
