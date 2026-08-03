import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { Extracted, UnsupportedSourceError } from './extractor';

export type Article = Extracted & { title: string | null };

export function extractHtml(html: string, url: string): Article {
	// readability braucht ein echtes document, ein html-parser allein reicht nicht
	const dom = new JSDOM(html, { url });
	const article = new Readability(dom.window.document).parse();

	const text = article?.textContent?.trim() ?? '';
	if (text.length < 40) {
		throw new UnsupportedSourceError(
			'Von dieser Seite ließ sich kein Inhalt lesen – lädt sie ihren Text per JavaScript nach?'
		);
	}

	// readability zieht den titel nur aus <title>, das fehlt oder taugt oft nichts
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
		throw new UnsupportedSourceError('Die Seite ist nicht erreichbar.');
	}

	const type = response.headers.get('content-type') ?? '';
	if (!type.includes('html') && !type.includes('text')) {
		throw new UnsupportedSourceError(`Dieser Inhaltstyp wird nicht unterstützt (${type}).`);
	}

	return extractHtml(await response.text(), url);
}
