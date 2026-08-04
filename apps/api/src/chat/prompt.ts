import type { ContextBlock } from './citations';

export const SYSTEM_PROMPT = [
	'Du beantwortest Fragen ausschließlich anhand der übergebenen Quellenauszüge.',
	'Nutze kein Vorwissen. Geben die Auszüge die Antwort nicht her, sage das offen.',
	'Belege jede inhaltliche Aussage mit der Nummer des Auszugs in eckigen Klammern, etwa [1].',
	'Erfinde keine Nummern. Es gibt nur die Auszüge, die dir übergeben wurden.',
	'Antworte auf Deutsch, sachlich und ohne Floskeln.'
].join(' ');

export function buildPrompt(question: string, blocks: ContextBlock[]): string {
	if (blocks.length === 0) {
		return [
			'Es wurden keine passenden Auszüge gefunden.',
			'',
			`Frage: ${question}`,
			'',
			'Antworte, dass die ausgewählten Quellen dazu nichts hergeben.'
		].join('\n');
	}

	const context = blocks
		.map((block, i) => {
			const location = block.page ? `${block.sourceTitle}, Seite ${block.page}` : block.sourceTitle;
			return `[${i + 1}] (${location})\n${block.content}`;
		})
		.join('\n\n');

	return `${context}\n\nFrage: ${question}`;
}
