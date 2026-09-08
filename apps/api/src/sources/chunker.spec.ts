import { describe, expect, it } from 'vitest';
import { chunk } from './chunker';

function paragraphText(count: number, sentences = 6): string {
	return Array.from({ length: count }, (_, p) =>
		Array.from(
			{ length: sentences },
			(_, s) => `Paragraph ${p} sentence ${s} with some filler about deadlines and contracts.`
		).join(' ')
	).join('\n\n');
}

describe('chunk', () => {
	it('holds the invariant the citations rest on', () => {
		const text = paragraphText(40);
		for (const c of chunk(text)) {
			expect(text.slice(c.charStart, c.charEnd)).toBe(c.content);
		}
	});

	it('holds the invariant for a single overlong paragraph too', () => {
		const text = 'Word '.repeat(4000);
		const chunks = chunk(text);

		expect(chunks.length).toBeGreaterThan(1);
		for (const c of chunks) {
			expect(text.slice(c.charStart, c.charEnd)).toBe(c.content);
		}
	});

	it('holds the invariant for text without punctuation or spaces', () => {
		const text = 'x'.repeat(10000);
		for (const c of chunk(text)) {
			expect(text.slice(c.charStart, c.charEnd)).toBe(c.content);
		}
	});

	it('leaves no content out', () => {
		const text = paragraphText(30);
		const chunks = chunk(text);

		expect(chunks[0].charStart).toBe(0);
		expect(chunks.at(-1)!.charEnd).toBe(text.length);

		// every chunk has to start where the previous one already was, or earlier
		for (let i = 1; i < chunks.length; i++) {
			expect(chunks[i].charStart).toBeLessThanOrEqual(chunks[i - 1].charEnd);
		}
	});

	it('overlaps, otherwise citations get cut off at the chunk boundary', () => {
		const chunks = chunk(paragraphText(30));
		const overlapping = chunks.filter((c, i) => i > 0 && c.charStart < chunks[i - 1].charEnd);
		expect(overlapping.length).toBeGreaterThan(0);
	});

	it('numbers without gaps, ascending', () => {
		const chunks = chunk(paragraphText(25));
		chunks.forEach((c, i) => expect(c.idx).toBe(i));
	});

	it('turns short text into exactly one chunk', () => {
		const text = 'A short sentence.';
		expect(chunk(text)).toEqual([{ idx: 0, content: text, charStart: 0, charEnd: text.length }]);
	});

	it('copes with empty input', () => {
		expect(chunk('')).toEqual([]);
		expect(chunk('   \n\n  \n ')).toEqual([]);
	});

	it('produces no empty chunks', () => {
		for (const c of chunk(paragraphText(30))) {
			expect(c.content.trim().length).toBeGreaterThan(0);
		}
	});

	it('terminates on paragraphs made of one long word', () => {
		const text = ['a'.repeat(9000), 'b'.repeat(9000)].join('\n\n');
		const chunks = chunk(text);

		expect(chunks.length).toBeGreaterThan(1);
		for (const c of chunks) {
			expect(text.slice(c.charStart, c.charEnd)).toBe(c.content);
		}
	});
});
