type Snapshot = {
  inboundSeq: number;
  messages: { total: number };
  suggestions: unknown;
  shownInboundSeq?: number;
  newMessages?: boolean;
};

// Keep the visible page stable while refreshing ownership, send permission and new-message hints.
export function messageSnapshot<T extends Snapshot>(next: T, previous: T | null, hold: boolean): T {
  if (!hold || !previous) return { ...next, shownInboundSeq: next.inboundSeq, newMessages: false };
  const shownInboundSeq = previous.shownInboundSeq ?? previous.inboundSeq;
  return {
    ...next,
    messages: previous.messages,
    suggestions: previous.suggestions,
    shownInboundSeq,
    newMessages: next.inboundSeq > shownInboundSeq || next.messages.total > previous.messages.total,
  };
}
