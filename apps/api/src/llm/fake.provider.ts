import { Injectable } from '@nestjs/common';
import {
	CompletionOptions,
	EMBEDDING_DIMENSIONS,
	LlmProvider,
	normalize,
	Speaker,
	SpokenAudio
} from './llm.provider';

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

// deterministic so tests stay reproducible - nothing semantic about it
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

	async speak(dialogue: string, _speakers: Speaker[]): Promise<SpokenAudio> {
		const sampleRate = 24000;
		const seconds = Math.min(20, Math.max(2, Math.round(dialogue.length / 90)));
		const pcm = Buffer.alloc(sampleRate * seconds * 2);

		// a quiet sine wave so the player has something to play in dev mode
		for (let i = 0; i < pcm.length / 2; i++) {
			pcm.writeInt16LE(Math.round(Math.sin((i / sampleRate) * 2 * Math.PI * 220) * 2200), i * 2);
		}

		return { pcm, sampleRate };
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

// the studio outputs should stay workable without an api key
function looksLikeJsonRequest(prompt: string): boolean {
	return prompt.includes('as JSON');
}

const FAKE_TREE = JSON.stringify({
	label: 'Sample notebook',
	children: [
		{ label: 'Notice periods', children: [{ label: 'Four weeks to the end of the month' }] },
		{ label: 'Warranty', children: [{ label: '24 months from delivery' }] }
	]
});

function buildAnswer(blocks: number): string {
	if (blocks === 0) {
		return 'The selected sources say nothing about that.';
	}

	// [99] is deliberate: the citation parser has to drop hallucinated numbers
	const cited =
		blocks >= 2
			? 'According to the sources this holds [1] and so does that [2].'
			: 'According to the source this holds [1].';
	return `${cited} One more point cannot be backed up like this [99].`;
}
