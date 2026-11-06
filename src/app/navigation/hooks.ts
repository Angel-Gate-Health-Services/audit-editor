import { useMemo } from 'react';
import { useLocation } from 'react-router';
import { partsOf } from './route.ts';

export function useRouteParts() {
  const location = useLocation();
  return useMemo(() => partsOf(window.location.hash || `#${location.pathname}`), [location]);
}
