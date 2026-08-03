import { extractText, getDocumentProxy } from 'unpdf';
import { Extracted, UnsupportedSourceError } from './extractor';

const PAGE_SEPARATOR = '\n\n';

export async function extractPdf(buffer: Buffer): Promise<Extracted> {
	const pages = await readPages(buffer);

	const pageStarts: number[] = [];
	let text = '';

	for (const page of pages) {
		pageStarts.push(text.length);
		text += page;
		text += PAGE_SEPARATOR;
	}

	// gescannte pdfs liefern einen textlayer aus fast nur whitespace
	if (text.trim().length < 20) {
		throw new UnsupportedSourceError(
			'Aus dieser PDF lässt sich kein Text lesen – vermutlich ein Scan ohne Texterkennung.'
		);
	}

	return { text, pageStarts };
}

async function readPages(buffer: Buffer): Promise<string[]> {
	try {
		const pdf = await getDocumentProxy(new Uint8Array(buffer));
		const { text } = await extractText(pdf, { mergePages: false });
		return Array.isArray(text) ? text : [text];
	} catch (error) {
		const message = error instanceof Error ? error.message : '';
		if (/password|encrypted/i.test(message)) {
			throw new UnsupportedSourceError('Die PDF ist passwortgeschützt.');
		}
		throw new UnsupportedSourceError('Die PDF konnte nicht gelesen werden.');
	}
}
