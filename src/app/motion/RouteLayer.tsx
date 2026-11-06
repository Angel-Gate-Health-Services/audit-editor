import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { DISTANCE } from './tokens.ts';
import { enterLayer, takeEnter, type LayerScope } from './director.ts';

interface LayerProps {
  scope: LayerScope;
  layerKey: string;
  className: string;
  children: ReactNode;
  'data-shell-key'?: string;
}

function Layer({ scope, layerKey, className, children, ...rest }: LayerProps) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const plan = takeEnter(scope, layerKey);
    if (plan && ref.current) enterLayer(ref.current, plan.direction, scope === 'page' ? DISTANCE.page : DISTANCE.tab, scope === 'page');
  }, [scope, layerKey]);
  return <div ref={ref} className={className} {...rest}>{children}</div>;
}

export function RouteLayer(props: LayerProps) {
  return <Layer key={props.layerKey} {...props} />;
}
