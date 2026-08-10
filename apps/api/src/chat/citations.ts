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

// gemini gruppiert mehrere belege gern als [1, 2, 5], also gleich mit einsammeln
const MARKER = /\[(\d+(?:\s*,\s*\d+)*)\]/g;
const SNIPPET_CHARS = 220;

// modelle erfinden belege, die es nicht gibt - die fliegen raus
export function resolveCitations(text: string, blocks: ContextBlock[]) {
	const renumbered = new Map<number, number>();

	const cleaned = text.replace(MARKER, (_match, raw: string) => {
		const valid = raw
			.split(',')
			.map((part) => Number(part.trim()))
			.filter((n) => Number.isInteger(n) && n >= 1 && n <= blocks.length);

		return valid
			.map((original) => {
				if (!renumbered.has(original)) renumbered.set(original, renumbered.size + 1);
				return `[${renumbered.get(original)}]`;
			})
			.join('');
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
