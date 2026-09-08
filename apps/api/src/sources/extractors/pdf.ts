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

	// scanned pdfs come with a text layer of almost nothing but whitespace
	if (text.trim().length < 20) {
		throw new UnsupportedSourceError(
			'No text can be read from this PDF – most likely a scan without OCR.'
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
			throw new UnsupportedSourceError('The PDF is password protected.');
		}
		throw new UnsupportedSourceError('The PDF could not be read.');
	}
}
