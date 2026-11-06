import { useEffect, useState } from 'react';

export function useLinger<T>(value: T | null, ms: number, immediate: boolean) {
  const [held, setHeld] = useState<T | null>(value);
  const [seen, setSeen] = useState<T | null>(value);
  if (seen !== value) {
    setSeen(value);
    if (value !== null || immediate) setHeld(value);
  }
  const leaving = value === null && held !== null;
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => setHeld(null), ms);
    return () => clearTimeout(timer);
  }, [leaving, ms]);
  return { shown: value ?? held, leaving };
}
