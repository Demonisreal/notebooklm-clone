import { renderToStaticMarkup } from 'react-dom/server';
import type { Citation } from 'shared';
import { describe, expect, it } from 'vitest';
import { renderAnswer } from './chat-panel';

const citation: Citation = {
	n: 1,
	chunkId: 'chunk-a',
	sourceId: 'source-a',
	sourceTitle: 'Framework Agreement Zephyr-7.pdf',
	page: 2,
	charStart: 0,
	charEnd: 10,
	snippet: ''
};

function html(content: string, pending = false) {
	return renderToStaticMarkup(
		<>{renderAnswer(content, [citation], () => {}, pending && <i data-cursor="" />)}</>
	);
}

describe('renderAnswer', () => {
	it('hangs the cursor on the deepest last entry, not below the list', () => {
		const markup = html('- Warranty\n    - 24 months\n        - wear parts excluded', true);

		expect(markup).toContain('<span>wear parts excluded</span><i data-cursor=""></i></li></ul>');
		expect(markup.match(/data-cursor/g)).toHaveLength(1);
		expect(markup).not.toMatch(/<\/li><i data-cursor/);
	});

	it('hangs the cursor on the last entry of a flat list', () => {
		expect(html('Intro\n\n1. First\n2. Second', true)).toContain(
			'<span>Second</span><i data-cursor=""></i></li></ol>'
		);
	});

	it('hangs the cursor at the end of a trailing paragraph', () => {
		expect(html('- Item\n\nStill writing', true)).toContain(
			'<span>Still writing</span><i data-cursor=""></i></p>'
		);
	});

	it('leaves the cursor out once the answer is complete', () => {
		expect(html('- Warranty\n    - 24 months')).not.toContain('data-cursor');
	});

	it('keeps citations clickable inside nested items', () => {
		const markup = html('- Warranty\n    - 24 months [1]');
		expect(markup).toMatch(/<ul[^>]*><li><span>24 months <\/span><button[^>]*>1<\/button>/);
	});
});
