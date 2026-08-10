export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

export const EMBEDDING_DIMENSIONS = 768;

export type CompletionOptions = {
	system?: string;
	temperature?: number;
	signal?: AbortSignal;
};

export type Speaker = { name: string; voice: string };

export type SpokenAudio = {
	pcm: Buffer;
	sampleRate: number;
};

export interface LlmProvider {
	embed(texts: string[]): Promise<number[][]>;
	complete(prompt: string, options?: CompletionOptions): Promise<string>;
	stream(prompt: string, options?: CompletionOptions): AsyncIterable<string>;
	speak(dialogue: string, speakers: Speaker[]): Promise<SpokenAudio>;
}

// cosine braucht laenge 1, nicht jedes modell liefert die
export function normalize(vector: number[]): number[] {
	let sum = 0;
	for (const value of vector) sum += value * value;

	const length = Math.sqrt(sum);
	if (length === 0) return vector;

	return vector.map((value) => value / length);
}
