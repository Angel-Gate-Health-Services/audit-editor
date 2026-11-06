import { createElement } from 'react';
import { OCTICON_DATA } from './octicon-data.ts';


export function Icon({ name, size = 16, className = '' }: { name: string; size?: number; className?: string }) {
  const parts = OCTICON_DATA[name] || [];
  return (
    <svg className={`octicon octicon-${name}${className ? ` ${className}` : ''}`} viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      {parts.map((part, i) => createElement(part.tag, { key: i, ...part.attrs }))}
    </svg>
  );
}
