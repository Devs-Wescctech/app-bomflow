export const POSTSALES_REFRESH_EVENT = "postsales:refresh";

export function parsePostsalesQueueTarget(search = "") {
  const params = new URLSearchParams(search);
  const status = params.get("status");
  const itemId = params.get("item");
  return {
    isReevaluation: status === "resolvida",
    itemId: itemId || null,
  };
}

export function postsalesRefreshDetail(notification) {
  if (notification?.type !== "postsales_resolucao") return null;
  return {
    status: "resolvida",
    itemId: notification.entity_id || notification.entityId
      ? String(notification.entity_id || notification.entityId)
      : null,
  };
}
