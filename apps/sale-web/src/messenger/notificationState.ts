export type NotificationSnapshot = {
  latest: { id: string; createdAt: string } | null;
  serverAt: string;
};
export function notificationCursor(
  previous: NotificationSnapshot | null,
  next: NotificationSnapshot,
): NotificationSnapshot {
  const floor = previous?.latest?.createdAt || previous?.serverAt || next.serverAt;
  return {
    serverAt: floor,
    latest: next.latest
      ? {
          ...next.latest,
          createdAt:
            Date.parse(next.latest.createdAt) > Date.parse(floor) ? next.latest.createdAt : floor,
        }
      : previous?.latest || null,
  };
}
// Initial load and repeated polls are silent. Outgoing messages never enter this feed.
export function newInbound(previous: NotificationSnapshot | null, next: NotificationSnapshot) {
  if (!previous || !next.latest || previous.latest?.id === next.latest.id) return false;
  return (
    Date.parse(next.latest.createdAt) >= Date.parse(previous.latest?.createdAt || previous.serverAt)
  );
}
