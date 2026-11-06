import { createElement, type ReactNode } from 'react';
import { LOGO_TREE, type SvgNode } from './logo-data.ts';

function render(node: SvgNode, id: string, key?: number): ReactNode {
  const attrs: Record<string, string | number | undefined> = { key };
  for (const [name, value] of Object.entries(node.attrs)) {
    if (name === 'xmlns' || name === 'xmlnsXlink') continue;
    const prop = name === 'class' ? 'className' : name === 'ariaLabel' ? 'aria-label' : name === 'ariaHidden' ? 'aria-hidden' : name;
    attrs[prop] = value.replaceAll('ID_TOKEN', id);
  }
  return createElement(node.tag, attrs, ...node.children.map((child, i) => render(child, id, i)));
}

export function Logo({ id, decorative = false }: { id: string; decorative?: boolean }) {
  const tree: SvgNode = decorative
    ? { ...LOGO_TREE, attrs: { ...Object.fromEntries(Object.entries(LOGO_TREE.attrs).filter(([k]) => k !== 'role' && k !== 'ariaLabel')), ariaHidden: 'true' } }
    : LOGO_TREE;
  return render(tree, id);
}
