import type { Citation } from 'shared';

export type ContextBlock = {
	chunkId: string;
	sourceId: string;
	sourceTitle: string;
	page: number | null;
	charStart: number;
	charEnd: number;
	content: string;
};

const MARKER = /\[(\d+)\]/g;
const SNIPPET_CHARS = 220;

// modelle erfinden regelmaessig belege, die es nicht gibt. was sich nicht
// aufloesen laesst, fliegt raus statt als toter chip im text zu stehen
export function resolveCitations(text: string, blocks: ContextBlock[]) {
	const renumbered = new Map<number, number>();

	const cleaned = text.replace(MARKER, (match, raw: string) => {
		const original = Number(raw);
		if (original < 1 || original > blocks.length) return '';

		if (!renumbered.has(original)) renumbered.set(original, renumbered.size + 1);
		return `[${renumbered.get(original)}]`;
	});

	const citations: Citation[] = [...renumbered.entries()].map(([original, n]) => {
		const block = blocks[original - 1];
		return {
			n,
			chunkId: block.chunkId,
			sourceId: block.sourceId,
			sourceTitle: block.sourceTitle,
			page: block.page,
			charStart: block.charStart,
			charEnd: block.charEnd,
			snippet: snippet(block.content)
		};
	});

	return { text: tidy(cleaned), citations };
}

function snippet(content: string): string {
	const flat = content.replace(/\s+/g, ' ').trim();
	if (flat.length <= SNIPPET_CHARS) return flat;
	return `${flat.slice(0, SNIPPET_CHARS)}…`;
}

// nach dem entfernen bleiben doppelte leerzeichen und leerzeichen vor satzzeichen zurueck
function tidy(text: string): string {
	return text
		.replace(/ {2,}/g, ' ')
		.replace(/ ([.,;:!?])/g, '$1')
		.trim();
}
