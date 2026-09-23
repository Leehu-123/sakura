export type DraftImage = {
  id: string;
  title: string;
  attachment?: boolean;
  kind?: 'image' | 'file' | 'video';
};
export type SendState = 'CHECKING' | 'NOT_RECORDED' | 'SENDING' | 'UNKNOWN';
export type Draft = {
  text: string;
  image: DraftImage | null;
  requestKey: string;
  pending: SendState | null;
  updatedAt: number;
};
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;
const KEY = 'sakura.chat-drafts.v1';
const TTL = 24 * 60 * 60 * 1000;
const pendingStates = ['CHECKING', 'NOT_RECORDED', 'SENDING', 'UNKNOWN'];

// One account per tab. Async responses must also match the current account generation.
export function createDraftStore(storage: () => Storage, now = Date.now) {
  let actor = '',
    generation = 0,
    revision = 0,
    durable = true;
  let drafts: Record<string, Draft> = {};
  const listeners = new Set<() => void>();
  const emit = () => {
    revision++;
    listeners.forEach((fn) => fn());
  };
  const save = () => {
    try {
      storage().setItem(KEY, JSON.stringify({ actor, drafts }));
      durable = true;
    } catch {
      durable = false;
      // Do not restore an older snapshot after a failed write.
      try {
        storage().removeItem(KEY);
      } catch {
        /* Storage may be disabled. */
      }
    }
    emit();
  };
  const clear = () => {
    actor = '';
    drafts = {};
    generation++;
    try {
      storage().removeItem(KEY);
    } catch {
      /* Memory is cleared regardless. */
    }
    emit();
  };
  return {
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    snapshot: () => revision,
    durable: () => durable,
    clear,
    activate(id: string) {
      if (actor === id) return;
      drafts = {};
      actor = id;
      generation++;
      try {
        const saved = JSON.parse(storage().getItem(KEY) || 'null');
        if (saved?.actor === id && saved.drafts && typeof saved.drafts === 'object') {
          for (const [key, value] of Object.entries(saved.drafts)) {
            const d = value as Draft;
            if (
              !/^[a-f0-9-]{36}$/i.test(key) ||
              !d ||
              typeof d.text !== 'string' ||
              d.text.length > 2000 ||
              typeof d.requestKey !== 'string' ||
              !/^[a-f0-9-]{36}$/i.test(d.requestKey) ||
              !Number.isFinite(d.updatedAt) ||
              d.updatedAt <= now() - TTL ||
              d.updatedAt > now() ||
              (d.pending !== null && !pendingStates.includes(d.pending)) ||
              (d.image !== null &&
                (!d.image ||
                  typeof d.image.id !== 'string' ||
                  !/^[a-f0-9-]{36}$/i.test(d.image.id) ||
                  typeof d.image.title !== 'string' ||
                  d.image.title.length > 1000 ||
                  (d.image.attachment !== undefined && typeof d.image.attachment !== 'boolean') ||
                  (d.image.kind !== undefined && !['image', 'file'].includes(d.image.kind))))
            )
              continue;
            drafts[key] = {
              text: d.text,
              image: d.image
                ? {
                    id: d.image.id,
                    title: d.image.title,
                    ...(d.image.attachment ? { attachment: true, kind: d.image.kind } : {}),
                  }
                : null,
              requestKey: d.requestKey,
              pending: d.pending,
              updatedAt: d.updatedAt,
            };
          }
        }
      } catch {
        /* Invalid or unavailable browser storage starts empty. */
      }
      save();
    },
    get(id: string): Draft | undefined {
      return drafts[id];
    },
    edit(id: string, change: Partial<Pick<Draft, 'text' | 'image'>>) {
      if (!actor || drafts[id]?.pending) return;
      const d: Draft = {
        text: drafts[id]?.text || '',
        image: drafts[id]?.image || null,
        ...change,
        requestKey: crypto.randomUUID(),
        pending: null,
        updatedAt: now(),
      };
      if (!d.text && !d.image) delete drafts[id];
      else drafts[id] = d;
      // Keep pending attempts, evict only the oldest ordinary drafts at the limit.
      const older = Object.keys(drafts)
        .filter((key) => key !== id && !drafts[key].pending)
        .sort((a, b) => drafts[a].updatedAt - drafts[b].updatedAt);
      while (Object.keys(drafts).length > 100 && older.length) delete drafts[older.shift()!];
      save();
    },
    discard(id: string) {
      if (drafts[id]?.pending) return;
      delete drafts[id];
      save();
    },
    begin(id: string) {
      const d = drafts[id];
      if (
        !actor ||
        !d ||
        (!d.text.trim() && !d.image) ||
        (d.pending && d.pending !== 'NOT_RECORDED')
      )
        return null;
      drafts[id] = { ...d, pending: 'CHECKING', updatedAt: now() };
      save();
      return { ...d, generation };
    },
    ticket(id: string) {
      const d = drafts[id];
      return d ? { requestKey: d.requestKey, generation } : null;
    },
    settle(id: string, ticket: { requestKey: string; generation: number }, state: string) {
      const d = drafts[id];
      if (!actor || ticket.generation !== generation || d?.requestKey !== ticket.requestKey) return;
      if (state === 'SENT') {
        // An image is sent separately; preserve the text the employee has not sent.
        if (d.image && d.text)
          drafts[id] = {
            ...d,
            image: null,
            pending: null,
            requestKey: crypto.randomUUID(),
            updatedAt: now(),
          };
        else delete drafts[id];
      } else if (state === 'FAILED') {
        drafts[id] = { ...d, pending: null, requestKey: crypto.randomUUID(), updatedAt: now() };
      } else if (pendingStates.includes(state)) {
        drafts[id] = { ...d, pending: state as SendState, updatedAt: now() };
      } else return;
      save();
    },
  };
}

export const chatDrafts = createDraftStore(() => window.sessionStorage);
