import { describe, expect, it } from 'vitest';
import { extractHtml } from './html';
import { pageForOffset, UnsupportedSourceError } from './extractor';

const page = `
<!doctype html>
<html><body>
	<nav><a href="/">Startseite</a><a href="/preise">Preise</a></nav>
	<article>
		<h1>Kündigungsfristen im Überblick</h1>
		<p>Die Frist beträgt vier Wochen zum Monatsende. Maßgeblich ist der Zugang
		der Kündigung beim Empfänger, nicht das Datum des Poststempels.</p>
		<p>Bei Bestandskunden gilt eine abweichende Regelung nach § 15a des Vertrags.</p>
	</article>
	<footer>Impressum · Datenschutz · Cookie-Einstellungen</footer>
</body></html>`;

describe('extractHtml', () => {
	it('behaelt den fliesstext', () => {
		const { text } = extractHtml(page, 'https://example.com/fristen');
		expect(text).toContain('vier Wochen zum Monatsende');
		expect(text).toContain('§ 15a');
	});

	it('wirft navigation und footer raus, die sonst in jedem chunk landen', () => {
		const { text } = extractHtml(page, 'https://example.com/fristen');
		expect(text).not.toContain('Cookie-Einstellungen');
		expect(text).not.toContain('Impressum');
	});

	it('liest den titel aus dem title-tag', () => {
		const withTitle = page.replace(
			'<html>',
			'<html><head><title>Fristen | Beispiel AG</title></head>'
		);
		expect(extractHtml(withTitle, 'https://example.com/f').title).toBe('Fristen | Beispiel AG');
	});

	it('faellt auf die ueberschrift zurueck, wenn kein title-tag da ist', () => {
		expect(extractHtml(page, 'https://example.com/f').title).toContain('Kündigungsfristen');
	});

	it('meldet seiten, die ihren inhalt erst per javascript laden', () => {
		const shell = '<!doctype html><html><body><div id="root"></div></body></html>';
		expect(() => extractHtml(shell, 'https://example.com')).toThrow(UnsupportedSourceError);
	});
});

describe('pageForOffset', () => {
	// seite 1 ab 0, seite 2 ab 100, seite 3 ab 250
	const starts = [0, 100, 250];

	it('ordnet offsets der richtigen seite zu', () => {
		expect(pageForOffset(starts, 0)).toBe(1);
		expect(pageForOffset(starts, 99)).toBe(1);
		expect(pageForOffset(starts, 100)).toBe(2);
		expect(pageForOffset(starts, 249)).toBe(2);
		expect(pageForOffset(starts, 250)).toBe(3);
		expect(pageForOffset(starts, 9999)).toBe(3);
	});

	it('gibt null zurueck, wenn die quelle keine seiten hat', () => {
		expect(pageForOffset([], 42)).toBeNull();
	});
});
