export const OPTIMIZER_MIN_BUDGET = 1_000_000;
export const OPTIMIZER_MAX_BUDGET = 10_000_000;
export const OPTIMIZER_DEBOUNCE_MS = 400;

export function matchesExposure(internetFacing: boolean, filter: string): boolean {
  return filter === '' || (filter === 'internet' ? internetFacing : !internetFacing);
}

export function toggleConstraint(required: string[], excluded: string[], key: string, mode: 'required' | 'excluded') {
  return {
    required: mode === 'required' && !required.includes(key)
      ? [...required, key] : required.filter(value => value !== key),
    excluded: mode === 'excluded' && !excluded.includes(key)
      ? [...excluded, key] : excluded.filter(value => value !== key),
  };
}
