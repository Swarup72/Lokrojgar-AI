import client from "./client";

/**
 * Fetch paginated notifications for the authenticated user.
 *
 * @param {Object} [params]
 * @param {number} [params.page=1]
 * @param {number} [params.limit=20]
 * @param {boolean} [params.isRead]
 * @param {string} [params.type]
 * @returns {Promise<{ notifications: Array, pagination: Object, unreadCount: number }>}
 */
export function getNotifications(params = {}) {
  return client.get("/notifications", { params }).then((res) => res.data.data);
}

/**
 * Fetch unread notification count.
 * @returns {Promise<{ unreadCount: number }>}
 */
export function getUnreadCount() {
  return client.get("/notifications/unread-count").then((res) => res.data.data);
}

/**
 * Mark a single notification as read.
 * @param {string} id
 */
export function markAsRead(id) {
  return client.patch(`/notifications/${id}/read`).then((res) => res.data.data);
}

/**
 * Mark all notifications as read.
 */
export function markAllAsRead() {
  return client.patch("/notifications/read-all").then((res) => res.data.data);
}
