import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractPdf } from './pdf';
import { pageForOffset, UnsupportedSourceError } from './extractor';

const fixture = join(__dirname, '../../../test/fixtures/three-pager.pdf');

describe('extractPdf', () => {
	it('reads the text of every page', async () => {
		const { text } = await extractPdf(await readFile(fixture));
		expect(text).toContain('notice period');
		expect(text).toContain('Zephyr-7');
		expect(text).toContain('15a');
	});

	it('finds three page boundaries', async () => {
		const { pageStarts } = await extractPdf(await readFile(fixture));
		expect(pageStarts).toHaveLength(3);
	});

	it('maps each page body to the right page', async () => {
		const { text, pageStarts } = await extractPdf(await readFile(fixture));

		const markers = ['PAGE ONE', 'PAGE TWO', 'PAGE THREE'];
		markers.forEach((marker, index) => {
			expect(pageForOffset(pageStarts, text.indexOf(marker))).toBe(index + 1);
		});
	});

	it('flags a scan without a text layer instead of returning empty text', async () => {
		// valid pdf, but without text - that is what a scan looks like
		const empty = Buffer.from(
			'%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
				'2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
				'3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\n' +
				'trailer<</Root 1 0 R>>'
		);
		await expect(extractPdf(empty)).rejects.toThrow(UnsupportedSourceError);
	});
});
