import type { ContextBlock } from './citations';

export const SYSTEM_PROMPT = [
	'You answer questions from the given source excerpts and nothing else.',
	'Do not fall back on prior knowledge. Where the excerpts do not carry the answer, say so plainly.',
	'Back every factual statement with the number of the excerpt in square brackets, such as [1].',
	'Several references each get their own brackets, so [1][2] and not [1, 2].',
	'Do not invent numbers. Only the excerpts handed to you exist.',
	'Answer in the language of the question, factually and without filler.'
].join(' ');

export function buildPrompt(question: string, blocks: ContextBlock[]): string {
	if (blocks.length === 0) {
		return ['No matching excerpts were found.', '', `Question: ${question}`].join('\n');
	}

	const context = blocks
		.map((block, i) => {
			const location = block.page ? `${block.sourceTitle}, page ${block.page}` : block.sourceTitle;
			return `[${i + 1}] (${location})\n${block.content}`;
		})
		.join('\n\n');

	return `${context}\n\nQuestion: ${question}`;
}
