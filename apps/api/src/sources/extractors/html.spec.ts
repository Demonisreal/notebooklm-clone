import { describe, expect, it } from 'vitest';
import { extractHtml } from './html';
import { pageForOffset, UnsupportedSourceError } from './extractor';

const page = `
<!doctype html>
<html><body>
	<nav><a href="/">Home</a><a href="/pricing">Pricing</a></nav>
	<article>
		<h1>Notice periods at a glance</h1>
		<p>The notice period is four weeks to the end of the month. What counts is the day
		the notice reaches the recipient, not the postmark.</p>
		<p>Existing customers fall under a separate rule in section 15a of the contract.</p>
	</article>
	<footer>Imprint · Privacy · Cookie settings</footer>
</body></html>`;

describe('extractHtml', () => {
	it('keeps the body text', () => {
		const { text } = extractHtml(page, 'https://example.com/notice');
		expect(text).toContain('four weeks to the end of the month');
		expect(text).toContain('section 15a');
	});

	it('throws out nav and footer, which would land in every chunk otherwise', () => {
		const { text } = extractHtml(page, 'https://example.com/notice');
		expect(text).not.toContain('Cookie settings');
		expect(text).not.toContain('Imprint');
	});

	it('reads the title from the title tag', () => {
		const withTitle = page.replace(
			'<html>',
			'<html><head><title>Notice periods | Example Ltd</title></head>'
		);
		expect(extractHtml(withTitle, 'https://example.com/f').title).toBe(
			'Notice periods | Example Ltd'
		);
	});

	it('falls back to the heading when there is no title tag', () => {
		expect(extractHtml(page, 'https://example.com/f').title).toContain('Notice periods');
	});

	it('flags pages that only load their content through javascript', () => {
		const shell = '<!doctype html><html><body><div id="root"></div></body></html>';
		expect(() => extractHtml(shell, 'https://example.com')).toThrow(UnsupportedSourceError);
	});
});

describe('pageForOffset', () => {
	// page 1 from 0, page 2 from 100, page 3 from 250
	const starts = [0, 100, 250];

	it('maps offsets to the right page', () => {
		expect(pageForOffset(starts, 0)).toBe(1);
		expect(pageForOffset(starts, 99)).toBe(1);
		expect(pageForOffset(starts, 100)).toBe(2);
		expect(pageForOffset(starts, 249)).toBe(2);
		expect(pageForOffset(starts, 250)).toBe(3);
		expect(pageForOffset(starts, 9999)).toBe(3);
	});

	it('returns null when the source has no pages', () => {
		expect(pageForOffset([], 42)).toBeNull();
	});
});
