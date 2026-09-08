import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { Extracted, UnsupportedSourceError } from './extractor';

export type Article = Extracted & { title: string | null };

export function extractHtml(html: string, url: string): Article {
	// readability needs a real document, an html parser on its own will not do
	const dom = new JSDOM(html, { url });
	const article = new Readability(dom.window.document).parse();

	const text = article?.textContent?.trim() ?? '';
	if (text.length < 40) {
		throw new UnsupportedSourceError(
			'Nothing readable came out of this page – does it pull in its text with JavaScript?'
		);
	}

	// readability takes the title from <title> only, which is often missing or useless
	const heading = dom.window.document.querySelector('h1')?.textContent?.trim();
	const title = article?.title?.trim() || heading || null;

	return { text, pageStarts: [], title };
}

export async function fetchArticle(url: string): Promise<Article> {
	const response = await fetch(url, {
		redirect: 'follow',
		headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NotebookClone/0.1)' },
		signal: AbortSignal.timeout(15000)
	}).catch(() => null);

	if (!response?.ok) {
		throw new UnsupportedSourceError('The page cannot be reached.');
	}

	const type = response.headers.get('content-type') ?? '';
	if (!type.includes('html') && !type.includes('text')) {
		throw new UnsupportedSourceError(`This content type is not supported (${type}).`);
	}

	return extractHtml(await response.text(), url);
}
