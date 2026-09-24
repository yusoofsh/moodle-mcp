/** Shared across OAuth login and owner setup to bound expensive password hashing. */
const active = new WeakSet<object>();
export function acquirePasswordSlot(owner: object): (() => void) | undefined {
  if (active.has(owner)) return undefined;
  active.add(owner);
  let released = false;
  return () => {
    if (!released) {
      released = true;
      active.delete(owner);
    }
  };
}
