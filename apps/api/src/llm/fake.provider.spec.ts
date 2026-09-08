import { describe, expect, it } from 'vitest';
import { FakeProvider } from './fake.provider';
import { EMBEDDING_DIMENSIONS, normalize } from './llm.provider';

describe('FakeProvider', () => {
	const provider = new FakeProvider();

	it('returns vectors in the dimension the db expects', async () => {
		const [vector] = await provider.embed(['some text']);
		expect(vector).toHaveLength(EMBEDDING_DIMENSIONS);
	});

	it('is deterministic, otherwise tests would not be reproducible', async () => {
		const [a] = await provider.embed(['same text']);
		const [b] = await provider.embed(['same text']);
		expect(a).toEqual(b);
	});

	it('tells different texts apart', async () => {
		const [a] = await provider.embed(['text one']);
		const [b] = await provider.embed(['text two']);
		expect(a).not.toEqual(b);
	});

	it('normalizes, because cosine similarity would be off otherwise', async () => {
		const [vector] = await provider.embed(['some text']);
		const length = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
		expect(length).toBeCloseTo(1, 10);
	});

	it('streams citations when the prompt carries context blocks', async () => {
		const prompt = '[1] First block\n[2] Second block\n\nQuestion: what is this about?';
		const answer = await provider.complete(prompt);
		expect(answer).toContain('[1]');
		expect(answer).toContain('[2]');
	});

	it('says without context that the sources have nothing to give', async () => {
		const answer = await provider.complete('Question without context');
		expect(answer).toContain('nothing');
	});

	it('stops on abort', async () => {
		const controller = new AbortController();
		controller.abort();

		const parts: string[] = [];
		for await (const chunk of provider.stream('[1] Block', { signal: controller.signal })) {
			parts.push(chunk);
		}
		expect(parts).toHaveLength(0);
	});
});

describe('normalize', () => {
	it('scales a vector to length 1', () => {
		expect(normalize([3, 4])).toEqual([0.6, 0.8]);
	});

	it('leaves the zero vector alone instead of dividing by zero', () => {
		expect(normalize([0, 0])).toEqual([0, 0]);
	});
});
