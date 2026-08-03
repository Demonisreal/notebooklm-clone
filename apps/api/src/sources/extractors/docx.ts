import mammoth from 'mammoth';
import { Extracted, UnsupportedSourceError } from './extractor';

export async function extractDocx(buffer: Buffer): Promise<Extracted> {
	const { value } = await mammoth.extractRawText({ buffer });

	if (value.trim().length === 0) {
		throw new UnsupportedSourceError('Das Dokument enthält keinen Text.');
	}

	return { text: value, pageStarts: [] };
}
