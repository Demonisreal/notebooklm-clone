import { describe, expect, it } from 'vitest';
import { resolveCitations, type ContextBlock } from './citations';

function block(id: string, page: number | null = null): ContextBlock {
	return {
		chunkId: `chunk-${id}`,
		sourceId: `source-${id}`,
		sourceTitle: `Quelle ${id}`,
		page,
		charStart: 0,
		charEnd: 10,
		content: `Inhalt von ${id}`
	};
}

describe('resolveCitations', () => {
	const blocks = [block('a', 12), block('b'), block('c')];

	it('loest gueltige belege auf', () => {
		const { citations } = resolveCitations('Die Frist ist vier Wochen [1].', blocks);
		expect(citations).toHaveLength(1);
		expect(citations[0].chunkId).toBe('chunk-a');
		expect(citations[0].page).toBe(12);
	});

	it('wirft erfundene nummern raus statt sie als toten chip zu rendern', () => {
		const { text, citations } = resolveCitations('Belegt [1], erfunden [9].', blocks);
		expect(text).not.toContain('[9]');
		expect(citations).toHaveLength(1);
	});

	it('verwirft auch die null', () => {
		const { text, citations } = resolveCitations('Unsinn [0].', blocks);
		expect(text).toBe('Unsinn.');
		expect(citations).toHaveLength(0);
	});

	it('nummeriert lueckenlos neu, wenn das modell bloecke ueberspringt', () => {
		const { text, citations } = resolveCitations('Erst [3], dann [1].', blocks);
		expect(text).toBe('Erst [1], dann [2].');
		expect(citations.map((c) => c.chunkId)).toEqual(['chunk-c', 'chunk-a']);
	});

	it('vergibt fuer denselben block nur eine nummer', () => {
		const { text, citations } = resolveCitations('Hier [2] und dort [2].', blocks);
		expect(text).toBe('Hier [1] und dort [1].');
		expect(citations).toHaveLength(1);
	});

	it('raeumt leerzeichen vor satzzeichen auf', () => {
		const { text } = resolveCitations('Ein Satz [7] .', blocks);
		expect(text).toBe('Ein Satz.');
	});

	it('kommt ohne belege klar', () => {
		const { text, citations } = resolveCitations('Dazu steht nichts in den Quellen.', blocks);
		expect(text).toBe('Dazu steht nichts in den Quellen.');
		expect(citations).toEqual([]);
	});

	it('verwirft alles, wenn gar keine bloecke da sind', () => {
		const { text, citations } = resolveCitations('Angeblich belegt [1].', []);
		expect(text).toBe('Angeblich belegt.');
		expect(citations).toEqual([]);
	});

	it('teilt gruppierte belege auf, gemini schreibt gern [1, 2]', () => {
		const { text, citations } = resolveCitations('Gilt laut Quellen [1, 2].', blocks);
		expect(text).toBe('Gilt laut Quellen [1][2].');
		expect(citations.map((c) => c.chunkId)).toEqual(['chunk-a', 'chunk-b']);
	});

	it('behaelt in einer gruppe nur die auffindbaren nummern', () => {
		const { text, citations } = resolveCitations('Beleg [2, 9, 3].', blocks);
		expect(text).toBe('Beleg [1][2].');
		expect(citations.map((c) => c.chunkId)).toEqual(['chunk-b', 'chunk-c']);
	});

	it('verwirft eine gruppe komplett, wenn keine nummer stimmt', () => {
		const { text, citations } = resolveCitations('Angeblich [7, 8].', blocks);
		expect(text).toBe('Angeblich.');
		expect(citations).toEqual([]);
	});

	it('kuerzt lange schnipsel', () => {
		const lang = { ...block('x'), content: 'Wort '.repeat(200) };
		const { citations } = resolveCitations('Beleg [1].', [lang]);
		expect(citations[0].snippet.length).toBeLessThan(240);
		expect(citations[0].snippet.endsWith('…')).toBe(true);
	});
});
