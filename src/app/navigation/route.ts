export function partsOf(hash: string) {
  return hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
}

export function parseRoute() {
  return partsOf(location.hash);
}

export const href = (...parts: string[]) => '#/' + parts.map(encodeURIComponent).join('/');

export const go = (...parts: string[]) => {
  location.hash = href(...parts);
};

export const HOME_HASHES = ['#/', '#', '#/audits'];

export const isHomeHash = (hash: string) => !hash || HOME_HASHES.includes(hash);
