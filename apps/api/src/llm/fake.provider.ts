import { Injectable } from '@nestjs/common';
import { CompletionOptions, EMBEDDING_DIMENSIONS, LlmProvider, normalize } from './llm.provider';

function hash(text: string): number {
	let h = 2166136261;
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

function seeded(seed: number): () => number {
	let state = seed || 1;
	return () => {
		state |= 0;
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

// deterministisch, damit tests reproduzierbar sind - semantisch ist das nicht
@Injectable()
export class FakeProvider implements LlmProvider {
	async embed(texts: string[]): Promise<number[][]> {
		return texts.map((text) => {
			const random = seeded(hash(text));
			const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, () => random() - 0.5);
			return normalize(vector);
		});
	}

	async complete(prompt: string, options?: CompletionOptions): Promise<string> {
		const parts: string[] = [];
		for await (const chunk of this.stream(prompt, options)) parts.push(chunk);
		return parts.join('');
	}

	async *stream(prompt: string, options?: CompletionOptions): AsyncIterable<string> {
		const answer = looksLikeJsonRequest(prompt)
			? FAKE_TREE
			: buildAnswer(countContextBlocks(prompt));

		for (const word of answer.split(' ')) {
			if (options?.signal?.aborted) return;
			await new Promise((resolve) => setTimeout(resolve, 25));
			yield word + ' ';
		}
	}
}

function countContextBlocks(prompt: string): number {
	return prompt.match(/^\[\d+\]/gm)?.length ?? 0;
}

// die studio-ausgaben sollen ohne api-key entwickelbar bleiben
function looksLikeJsonRequest(prompt: string): boolean {
	return prompt.includes('als JSON');
}

const FAKE_TREE = JSON.stringify({
	label: 'Beispiel-Notizbuch',
	children: [
		{ label: 'Fristen', children: [{ label: 'Vier Wochen zum Monatsende' }] },
		{ label: 'Garantie', children: [{ label: '24 Monate ab Lieferung' }] }
	]
});

function buildAnswer(blocks: number): string {
	if (blocks === 0) {
		return 'Dazu steht nichts in den ausgewählten Quellen.';
	}

	// [99] ist absicht: der zitat-parser muss halluzinierte nummern verwerfen
	const cited =
		blocks >= 2
			? 'Laut den Quellen gilt das [1] und ergänzend auch das [2].'
			: 'Laut der Quelle gilt das [1].';
	return `${cited} Ein weiterer Punkt lässt sich so nicht belegen [99].`;
}
