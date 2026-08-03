import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractPdf } from './pdf';
import { pageForOffset, UnsupportedSourceError } from './extractor';

const fixture = join(__dirname, '../../../test/fixtures/dreiseiter.pdf');

describe('extractPdf', () => {
	it('liest den text aller seiten', async () => {
		const { text } = await extractPdf(await readFile(fixture));
		expect(text).toContain('Kuendigungsfrist');
		expect(text).toContain('Zephyr-7');
		expect(text).toContain('15a');
	});

	it('findet drei seitengrenzen', async () => {
		const { pageStarts } = await extractPdf(await readFile(fixture));
		expect(pageStarts).toHaveLength(3);
	});

	it('ordnet jeden seiteninhalt der richtigen seite zu', async () => {
		const { text, pageStarts } = await extractPdf(await readFile(fixture));

		const seiten = ['SEITE EINS', 'SEITE ZWEI', 'SEITE DREI'];
		seiten.forEach((marker, index) => {
			expect(pageForOffset(pageStarts, text.indexOf(marker))).toBe(index + 1);
		});
	});

	it('meldet einen scan ohne textlayer statt leeren text zu liefern', async () => {
		// gueltiges pdf, aber ohne text - so sieht ein scan aus
		const leer = Buffer.from(
			'%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
				'2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
				'3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\n' +
				'trailer<</Root 1 0 R>>'
		);
		await expect(extractPdf(leer)).rejects.toThrow(UnsupportedSourceError);
	});
});
