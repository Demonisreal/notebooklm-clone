export type Chunk = {
	idx: number;
	content: string;
	charStart: number;
	charEnd: number;
};

// ohne echten tokenizer ist jede token-schaetzung geraten, also direkt in zeichen
// rechnen. rund 3000 zeichen entsprechen bei deutschem text etwa 800 token
const MAX_CHARS = 3000;
const OVERLAP_CHARS = 450;
const MIN_CHARS = 120;

export function chunk(text: string): Chunk[] {
	const blocks = paragraphs(text);
	if (blocks.length === 0) return [];

	const ranges: { start: number; end: number }[] = [];
	let start = blocks[0].start;
	let end = blocks[0].end;

	for (let i = 1; i < blocks.length; i++) {
		const block = blocks[i];

		if (block.end - start <= MAX_CHARS) {
			end = block.end;
			continue;
		}

		ranges.push({ start, end });
		start = Math.min(backtrack(text, end, OVERLAP_CHARS), block.start);
		end = block.end;
	}

	ranges.push({ start, end });

	return ranges
		.flatMap((range) => split(text, range))
		.map((range, idx) => ({
			idx,
			// niemals trimmen, sonst zeigen die offsets nicht mehr auf den originaltext
			content: text.slice(range.start, range.end),
			charStart: range.start,
			charEnd: range.end
		}));
}

function paragraphs(text: string): { start: number; end: number }[] {
	const blocks: { start: number; end: number }[] = [];
	const separator = /\n[ \t]*\n/g;

	let cursor = 0;
	let match: RegExpExecArray | null;

	while ((match = separator.exec(text))) {
		if (match.index > cursor) blocks.push({ start: cursor, end: match.index });
		cursor = separator.lastIndex;
	}
	if (cursor < text.length) blocks.push({ start: cursor, end: text.length });

	return blocks.filter((block) => text.slice(block.start, block.end).trim().length > 0);
}

// ein einzelner absatz kann laenger als MAX_CHARS sein, dann an satzgrenzen weiter
function split(text: string, range: { start: number; end: number }) {
	if (range.end - range.start <= MAX_CHARS) return [range];

	const parts: { start: number; end: number }[] = [];
	let start = range.start;

	while (range.end - start > MAX_CHARS) {
		const limit = start + MAX_CHARS;
		const cut = sentenceEnd(text, start, limit) ?? wordEnd(text, start, limit);

		parts.push({ start, end: cut });
		start = Math.max(backtrack(text, cut, OVERLAP_CHARS), start + MIN_CHARS);
	}

	parts.push({ start, end: range.end });
	return parts;
}

function sentenceEnd(text: string, from: number, limit: number): number | null {
	for (let i = limit; i > from + MIN_CHARS; i--) {
		if (!'.!?'.includes(text[i - 1])) continue;
		if (i < text.length && !/\s/.test(text[i])) continue;
		return i;
	}
	return null;
}

function wordEnd(text: string, from: number, limit: number): number {
	for (let i = limit; i > from + MIN_CHARS; i--) {
		if (/\s/.test(text[i])) return i;
	}
	return limit;
}

// zurueck bis zur naechsten wortgrenze, damit die ueberlappung nicht mitten im wort beginnt
function backtrack(text: string, from: number, distance: number): number {
	const target = Math.max(0, from - distance);

	for (let i = target; i < from; i++) {
		if (/\s/.test(text[i])) return i + 1;
	}
	return target;
}
