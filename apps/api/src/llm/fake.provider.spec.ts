import { describe, expect, it } from 'vitest';
import { FakeProvider } from './fake.provider';
import { EMBEDDING_DIMENSIONS, normalize } from './llm.provider';

describe('FakeProvider', () => {
	const provider = new FakeProvider();

	it('liefert vektoren in der dimension, die auch in der db steht', async () => {
		const [vector] = await provider.embed(['irgendein text']);
		expect(vector).toHaveLength(EMBEDDING_DIMENSIONS);
	});

	it('ist deterministisch, sonst waeren tests nicht reproduzierbar', async () => {
		const [a] = await provider.embed(['gleicher text']);
		const [b] = await provider.embed(['gleicher text']);
		expect(a).toEqual(b);
	});

	it('unterscheidet verschiedene texte', async () => {
		const [a] = await provider.embed(['text eins']);
		const [b] = await provider.embed(['text zwei']);
		expect(a).not.toEqual(b);
	});

	it('normalisiert, weil cosine-similarity sonst falsch rechnet', async () => {
		const [vector] = await provider.embed(['irgendein text']);
		const length = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
		expect(length).toBeCloseTo(1, 10);
	});

	it('streamt zitate, wenn kontextbloecke im prompt stehen', async () => {
		const prompt = '[1] Erster Block\n[2] Zweiter Block\n\nFrage: worum geht es?';
		const answer = await provider.complete(prompt);
		expect(answer).toContain('[1]');
		expect(answer).toContain('[2]');
	});

	it('sagt ohne kontext, dass die quellen nichts hergeben', async () => {
		const answer = await provider.complete('Frage ohne kontext');
		expect(answer).toContain('nichts');
	});

	it('bricht bei abort ab', async () => {
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
	it('macht aus einem vektor die laenge 1', () => {
		expect(normalize([3, 4])).toEqual([0.6, 0.8]);
	});

	it('laesst den nullvektor in ruhe statt durch null zu teilen', () => {
		expect(normalize([0, 0])).toEqual([0, 0]);
	});
});
