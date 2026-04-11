/** Lightweight unique-id generator. Shared across utils to avoid circular imports. */
let _idCounter = Date.now();
export function uid() { return (++_idCounter).toString(36); }
