export function cssColorToHex(value: string): string;
export function officialColours(): Promise<Record<string, Record<string, string>>>;
export function resolvePalettes(): Promise<{ official: Record<string, Record<string, string>>; resolved: Record<string, { light: Record<string, string>; dark: Record<string, string> }> }>;
export function buildOutputs(): Promise<{ css: string; json: string }>;
