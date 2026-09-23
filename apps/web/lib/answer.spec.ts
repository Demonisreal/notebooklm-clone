import { describe, expect, it } from 'vitest';
import { type AnswerBlock, type AnswerList, parseAnswer } from './answer';

// the tree written back as an indented outline, easier to compare than nested objects
function outline(blocks: AnswerBlock[]): string[] {
	const lines: string[] = [];

	function walk(list: AnswerList, depth: number) {
		list.entries.forEach((entry, i) => {
			const marker = list.ordered ? `${list.start + i}.` : '-';
			lines.push(`${'  '.repeat(depth)}${marker} ${entry.text}`);
			entry.lists.forEach((sub) => walk(sub, depth + 1));
		});
	}

	for (const block of blocks) {
		if (block.kind === 'list') walk(block.list, 0);
		else lines.push(`${block.kind}: ${block.text}`);
	}
	return lines;
}

describe('parseAnswer', () => {
	it('nests indented bullets under the item above', () => {
		const blocks = parseAnswer(
			[
				'*   **Defects & Standard Warranty:**',
				'    *   Obvious defects must be reported within two weeks of delivery [1].',
				'    *   The standard warranty is 24 months [1][2].',
				'*   **Maintenance:** One inspection per year [1][3].'
			].join('\n')
		);

		expect(blocks).toHaveLength(1);
		expect(outline(blocks)).toEqual([
			'- **Defects & Standard Warranty:**',
			'  - Obvious defects must be reported within two weeks of delivery [1].',
			'  - The standard warranty is 24 months [1][2].',
			'- **Maintenance:** One inspection per year [1][3].'
		]);
	});

	it('nests the single space indent the api used to leave', () => {
		const blocks = parseAnswer('* **Special terms:**\n * Existing customers get 36 months [3].');
		expect(outline(blocks)).toEqual([
			'- **Special terms:**',
			'  - Existing customers get 36 months [3].'
		]);
	});

	it('goes several levels deep and finds its way back out', () => {
		const blocks = parseAnswer(
			[
				'- Term',
				'    - Twelve months',
				'        - Renews itself',
				'    - Four weeks notice',
				'- Prices'
			].join('\n')
		);
		expect(outline(blocks)).toEqual([
			'- Term',
			'  - Twelve months',
			'    - Renews itself',
			'  - Four weeks notice',
			'- Prices'
		]);
	});

	it('reads numbered lists with bullets below them', () => {
		const blocks = parseAnswer('1. **Term** [1]\n   - Twelve months\n2. **Payment** [2]');
		expect(outline(blocks)).toEqual(['1. **Term** [1]', '  - Twelve months', '2. **Payment** [2]']);
	});

	it('keeps counting where the model left off after a paragraph', () => {
		const blocks = parseAnswer('1. First\n2. Second\n\nIn between.\n\n3. Third');
		expect(outline(blocks)).toEqual([
			'1. First',
			'2. Second',
			'paragraph: In between.',
			'3. Third'
		]);
		expect(blocks[2]).toMatchObject({ kind: 'list', list: { ordered: true, start: 3 } });
	});

	it('keeps a list together across blank lines', () => {
		expect(parseAnswer('- One\n\n- Two\n\n    - Two and a half')).toHaveLength(1);
	});

	it('starts a new list when the marker changes on the same level', () => {
		const blocks = parseAnswer('- Bullet\n1. Numbered');
		expect(blocks.map((block) => block.kind === 'list' && block.list.ordered)).toEqual([
			false,
			true
		]);
	});

	it('takes neither bold nor italics at the start of a line for a bullet', () => {
		expect(outline(parseAnswer('**Note:** see above\n*Only* this'))).toEqual([
			'paragraph: **Note:** see above',
			'paragraph: *Only* this'
		]);
	});

	it('reads headings', () => {
		expect(outline(parseAnswer('## Warranty\nText'))).toEqual([
			'heading: Warranty',
			'paragraph: Text'
		]);
	});
});
