import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startPolling } from '../src/messenger/livePolling.ts';
import { messageSnapshot } from '../src/messenger/messageSnapshot.ts';

const flush = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function fixture(load, failure = () => false) {
  let available = true,
    wake,
    clock = 0,
    id = 0;
  const timers = new Map(),
    values = [],
    errors = [],
    pauses = [];
  const stop = startPolling({
    load,
    success: (value) => values.push(value),
    failure: (error) => {
      errors.push(error);
      return failure(error);
    },
    paused: (value) => pauses.push(value),
    environment: {
      available: () => available,
      schedule: (run, delay) => {
        timers.set(++id, { at: clock + delay, run });
        return id;
      },
      cancel: (timer) => timers.delete(timer),
      subscribe: (fn) => {
        wake = fn;
        return () => {
          wake = undefined;
        };
      },
    },
  });
  return {
    values,
    errors,
    pauses,
    timers,
    stop,
    wake: () => wake?.(),
    availability(value) {
      available = value;
      wake?.();
    },
    async advance(ms) {
      clock += ms;
      for (const [key, timer] of [...timers]) {
        if (timer.at <= clock) {
          timers.delete(key);
          timer.run();
        }
      }
      await flush();
    },
  };
}

test('polls after completion and never duplicates an in-flight request on focus', async () => {
  const first = deferred();
  let calls = 0;
  const f = fixture(() => {
    calls++;
    return calls === 1 ? first.promise : Promise.resolve('new');
  });
  await flush();
  f.wake();
  await f.advance(10000);
  assert.equal(calls, 1);
  first.resolve('old');
  await flush();
  await f.advance(4999);
  assert.equal(calls, 1);
  await f.advance(1);
  assert.equal(calls, 2);
  assert.deepEqual(f.values, ['old', 'new']);
  f.stop();
});

test('hiding/offline aborts pending requests; resume ignores obsolete responses', async () => {
  const requests = [];
  const f = fixture((signal) => {
    const request = deferred();
    requests.push({ ...request, signal });
    return request.promise;
  });
  await flush();
  f.availability(false);
  assert.equal(requests[0].signal.aborted, true);
  await f.advance(60000);
  assert.equal(requests.length, 1);
  f.availability(true);
  await flush();
  requests[1].resolve('current');
  requests[0].resolve('obsolete');
  await flush();
  assert.deepEqual(f.values, ['current']);
  assert.equal(f.pauses.at(-1), false);
  f.stop();
});

test('network failures back off and recover without dropping the previous successful value', async () => {
  let calls = 0;
  const f = fixture(async () => {
    calls++;
    if ([2, 3].includes(calls)) throw Error('offline');
    return calls;
  });
  await flush();
  await f.advance(5000);
  assert.deepEqual(f.values, [1]);
  await f.advance(9999);
  assert.equal(calls, 2);
  await f.advance(1);
  assert.equal(calls, 3);
  await f.advance(20000);
  assert.deepEqual(f.values, [1, 4]);
  await f.advance(5000);
  assert.equal(calls, 5);
  f.stop();
});

test('permission failure stops retries, including subsequent focus events', async () => {
  let calls = 0;
  const f = fixture(
    async () => {
      calls++;
      throw Error('forbidden');
    },
    () => true,
  );
  await flush();
  await f.advance(60000);
  f.wake();
  await flush();
  assert.equal(calls, 1);
  assert.equal(f.timers.size, 0);
  f.stop();
});

test('unmount cancels timers, listeners and any delayed response', async () => {
  const pending = deferred();
  let signal;
  const f = fixture((s) => {
    signal = s;
    return pending.promise;
  });
  await flush();
  f.stop();
  assert.equal(signal.aborted, true);
  pending.resolve('late');
  f.wake();
  await f.advance(60000);
  assert.deepEqual(f.values, []);
  assert.equal(f.timers.size, 0);
});

const old = {
  inboundSeq: 10,
  messages: { total: 40, items: ['visible-old-page'] },
  suggestions: { phones: [] },
  canSend: true,
  supportUserId: 'alice',
};
const incoming = {
  ...old,
  inboundSeq: 11,
  messages: { total: 42, items: ['new-message'] },
  canSend: false,
  supportUserId: 'bob',
};
test('old/scrolled/filtered pages stay stable while ownership and permissions update', () => {
  const result = messageSnapshot(incoming, old, true);
  assert.equal(result.messages, old.messages);
  assert.equal(result.shownInboundSeq, 10);
  assert.equal(result.newMessages, true);
  assert.equal(result.canSend, false);
  assert.equal(result.supportUserId, 'bob');
  const repeated = messageSnapshot(incoming, result, true);
  assert.equal(repeated.shownInboundSeq, 10);
  assert.equal(repeated.newMessages, true);
});
test('opening latest messages clears the notification and advances only the displayed read sequence', () => {
  const result = messageSnapshot(incoming, old, false);
  assert.equal(result.messages, incoming.messages);
  assert.equal(result.newMessages, false);
  assert.equal(result.shownInboundSeq, 11);
  const switched = messageSnapshot(incoming, null, true);
  assert.equal(switched.messages, incoming.messages);
  assert.equal(switched.newMessages, false);
});
test('outgoing updates also notify; unchanged snapshots do not invent new messages', () => {
  assert.equal(messageSnapshot({ ...incoming, inboundSeq: 10 }, old, true).newMessages, true);
  assert.equal(messageSnapshot({ ...old }, old, true).newMessages, false);
});
