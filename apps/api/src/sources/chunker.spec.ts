import { describe, expect, it } from 'vitest';
import { chunk } from './chunker';

function paragraphText(count: number, sentences = 6): string {
	return Array.from({ length: count }, (_, p) =>
		Array.from(
			{ length: sentences },
			(_, s) => `Absatz ${p} Satz ${s} mit etwas Fuelltext ueber Fristen und Vertraege.`
		).join(' ')
	).join('\n\n');
}

describe('chunk', () => {
	it('haelt die invariante, auf der die zitate stehen', () => {
		const text = paragraphText(40);
		for (const c of chunk(text)) {
			expect(text.slice(c.charStart, c.charEnd)).toBe(c.content);
		}
	});

	it('haelt die invariante auch bei einem einzigen ueberlangen absatz', () => {
		const text = 'Wort '.repeat(4000);
		const chunks = chunk(text);

		expect(chunks.length).toBeGreaterThan(1);
		for (const c of chunks) {
			expect(text.slice(c.charStart, c.charEnd)).toBe(c.content);
		}
	});

	it('haelt die invariante bei text ohne satzzeichen und ohne leerzeichen', () => {
		const text = 'x'.repeat(10000);
		for (const c of chunk(text)) {
			expect(text.slice(c.charStart, c.charEnd)).toBe(c.content);
		}
	});

	it('laesst keinen inhalt aus', () => {
		const text = paragraphText(30);
		const chunks = chunk(text);

		expect(chunks[0].charStart).toBe(0);
		expect(chunks.at(-1)!.charEnd).toBe(text.length);

		// jeder chunk muss dort beginnen, wo der vorherige schon war oder frueher
		for (let i = 1; i < chunks.length; i++) {
			expect(chunks[i].charStart).toBeLessThanOrEqual(chunks[i - 1].charEnd);
		}
	});

	it('ueberlappt, sonst reissen zitate an der chunk-grenze ab', () => {
		const chunks = chunk(paragraphText(30));
		const overlapping = chunks.filter((c, i) => i > 0 && c.charStart < chunks[i - 1].charEnd);
		expect(overlapping.length).toBeGreaterThan(0);
	});

	it('nummeriert luecklos und aufsteigend', () => {
		const chunks = chunk(paragraphText(25));
		chunks.forEach((c, i) => expect(c.idx).toBe(i));
	});

	it('macht aus kurzem text genau einen chunk', () => {
		const text = 'Ein kurzer Satz.';
		expect(chunk(text)).toEqual([{ idx: 0, content: text, charStart: 0, charEnd: text.length }]);
	});

	it('kommt mit leerem input klar', () => {
		expect(chunk('')).toEqual([]);
		expect(chunk('   \n\n  \n ')).toEqual([]);
	});

	it('erzeugt keine leeren chunks', () => {
		for (const c of chunk(paragraphText(30))) {
			expect(c.content.trim().length).toBeGreaterThan(0);
		}
	});

	it('terminiert bei absaetzen aus einem einzigen langen wort', () => {
		const text = ['a'.repeat(9000), 'b'.repeat(9000)].join('\n\n');
		const chunks = chunk(text);

		expect(chunks.length).toBeGreaterThan(1);
		for (const c of chunks) {
			expect(text.slice(c.charStart, c.charEnd)).toBe(c.content);
		}
	});
});
