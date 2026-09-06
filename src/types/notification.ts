export interface NotificationItem {
  id: string;
  type: "submitted" | "approved" | "rejected" | "returned";
  title: string;
  message: string;
  read: boolean;
  applicationId: string | null;
  createdAt: string;
}

export interface NotificationListResponse {
  items: NotificationItem[];
  unreadCount: number;
}
