export type Extracted = {
	text: string;
	// character offset each page starts at. empty for sources without pages
	pageStarts: number[];
};

export class UnsupportedSourceError extends Error {}

export function pageForOffset(pageStarts: number[], offset: number): number | null {
	if (pageStarts.length === 0) return null;

	let page = 1;
	for (let i = 0; i < pageStarts.length; i++) {
		if (pageStarts[i] > offset) break;
		page = i + 1;
	}
	return page;
}
