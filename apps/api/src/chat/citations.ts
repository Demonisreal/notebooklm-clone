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

// gemini likes to group several references as [1, 2, 5], so pick those up as well
const MARKER = /\[(\d+(?:\s*,\s*\d+)*)\]/g;
const SNIPPET_CHARS = 220;

// models invent references that do not exist - those get thrown out
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

// removing markers leaves double spaces and spaces in front of punctuation
function tidy(text: string): string {
	return text
		.replace(/ {2,}/g, ' ')
		.replace(/ ([.,;:!?])/g, '$1')
		.trim();
}
