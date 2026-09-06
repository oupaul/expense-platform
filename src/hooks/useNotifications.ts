import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { AuthState } from "@/types/auth";
import type { NotificationListResponse } from "@/types/notification";

export function useNotifications(auth: AuthState) {
  const queryClient = useQueryClient();
  const queryKey = ["notifications", auth.user.companyId];

  const query = useQuery({
    queryKey,
    queryFn: () =>
      apiFetch<NotificationListResponse>(`/companies/${auth.user.companyId}/notifications`, { token: auth.token }),
    // 沒有 websocket，用輪詢頂著——30 秒對「有沒有新通知」這種情境已經夠即時，
    // 太短的話只是白白增加後端負擔。
    refetchInterval: 30_000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/companies/${auth.user.companyId}/notifications/${id}/read`, { method: "POST", token: auth.token }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const markAllRead = useMutation({
    mutationFn: () =>
      apiFetch<void>(`/companies/${auth.user.companyId}/notifications/read-all`, { method: "POST", token: auth.token }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  return { ...query, markRead, markAllRead };
}
