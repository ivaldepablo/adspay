export const MIN_LEGIBLE: number;
export const REFERENCE_WIDTH: number;
export const MARKER: string;
export const ELLIPSIS: string;

export function width(text: string): number;

export function fit(text: string, budget: number): {
  rendered: string;
  wasTruncated: boolean;
  renderable: boolean;
};
