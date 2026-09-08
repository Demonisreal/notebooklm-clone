import { describe, expect, it } from 'vitest';
import { resolveCitations, type ContextBlock } from './citations';

function block(id: string, page: number | null = null): ContextBlock {
	return {
		chunkId: `chunk-${id}`,
		sourceId: `source-${id}`,
		sourceTitle: `Source ${id}`,
		page,
		charStart: 0,
		charEnd: 10,
		content: `Content of ${id}`
	};
}

describe('resolveCitations', () => {
	const blocks = [block('a', 12), block('b'), block('c')];

	it('resolves valid references', () => {
		const { citations } = resolveCitations('The notice period is four weeks [1].', blocks);
		expect(citations).toHaveLength(1);
		expect(citations[0].chunkId).toBe('chunk-a');
		expect(citations[0].page).toBe(12);
	});

	it('throws out made up numbers instead of rendering a dead chip', () => {
		const { text, citations } = resolveCitations('Backed [1], made up [9].', blocks);
		expect(text).not.toContain('[9]');
		expect(citations).toHaveLength(1);
	});

	it('drops the zero as well', () => {
		const { text, citations } = resolveCitations('Nonsense [0].', blocks);
		expect(text).toBe('Nonsense.');
		expect(citations).toHaveLength(0);
	});

	it('renumbers without gaps when the model skips blocks', () => {
		const { text, citations } = resolveCitations('First [3], then [1].', blocks);
		expect(text).toBe('First [1], then [2].');
		expect(citations.map((c) => c.chunkId)).toEqual(['chunk-c', 'chunk-a']);
	});

	it('hands out one number per block', () => {
		const { text, citations } = resolveCitations('Here [2] and there [2].', blocks);
		expect(text).toBe('Here [1] and there [1].');
		expect(citations).toHaveLength(1);
	});

	it('cleans up spaces in front of punctuation', () => {
		const { text } = resolveCitations('One sentence [7] .', blocks);
		expect(text).toBe('One sentence.');
	});

	it('copes without any references', () => {
		const { text, citations } = resolveCitations('The sources say nothing about that.', blocks);
		expect(text).toBe('The sources say nothing about that.');
		expect(citations).toEqual([]);
	});

	it('drops everything when there are no blocks at all', () => {
		const { text, citations } = resolveCitations('Supposedly backed [1].', []);
		expect(text).toBe('Supposedly backed.');
		expect(citations).toEqual([]);
	});

	it('splits grouped references, gemini likes to write [1, 2]', () => {
		const { text, citations } = resolveCitations('True according to the sources [1, 2].', blocks);
		expect(text).toBe('True according to the sources [1][2].');
		expect(citations.map((c) => c.chunkId)).toEqual(['chunk-a', 'chunk-b']);
	});

	it('keeps only the numbers in a group that can be found', () => {
		const { text, citations } = resolveCitations('Reference [2, 9, 3].', blocks);
		expect(text).toBe('Reference [1][2].');
		expect(citations.map((c) => c.chunkId)).toEqual(['chunk-b', 'chunk-c']);
	});

	it('drops a whole group when no number checks out', () => {
		const { text, citations } = resolveCitations('Supposedly [7, 8].', blocks);
		expect(text).toBe('Supposedly.');
		expect(citations).toEqual([]);
	});

	it('shortens long snippets', () => {
		const long = { ...block('x'), content: 'Word '.repeat(200) };
		const { citations } = resolveCitations('Reference [1].', [long]);
		expect(citations[0].snippet.length).toBeLessThan(240);
		expect(citations[0].snippet.endsWith('…')).toBe(true);
	});
});
