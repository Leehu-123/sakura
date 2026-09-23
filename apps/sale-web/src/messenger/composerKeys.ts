type Key = {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  repeat: boolean;
  isComposing: boolean;
  keyCode: number;
};

// IME confirmation (including Safari's 229) must never send a message.
export function isSendKey(e: Key, composing = false) {
  return (
    e.key === 'Enter' &&
    !e.shiftKey &&
    !e.ctrlKey &&
    !e.altKey &&
    !e.metaKey &&
    !e.repeat &&
    !e.isComposing &&
    !composing &&
    e.keyCode !== 229
  );
}
