export function createChangedPatch<TValue extends Record<string, unknown>>(
  next: TValue,
  current: Partial<TValue>,
  alwaysInclude: ReadonlySet<keyof TValue> = new Set(),
) {
  return Object.fromEntries(
    Object.entries(next).filter(([key, value]) => {
      const typedKey = key as keyof TValue;
      return (
        alwaysInclude.has(typedKey) ||
        JSON.stringify(value) !== JSON.stringify(current[typedKey])
      );
    }),
  ) as Partial<TValue>;
}
