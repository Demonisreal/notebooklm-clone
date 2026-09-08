import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Bottleneck from 'bottleneck';
import {
	CompletionOptions,
	EMBEDDING_DIMENSIONS,
	LlmProvider,
	normalize,
	Speaker,
	SpokenAudio
} from './llm.provider';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

export class GeminiProvider implements LlmProvider {
	private readonly apiKey: string;
	private readonly chatModel: string;
	private readonly embeddingModel: string;
	private readonly ttsModel: string;

	// free tier ~10 rpm, without throttling a big pdf hits 429 right away
	private readonly limiter = new Bottleneck({ minTime: 5000, maxConcurrent: 1 });

	constructor(config: ConfigService) {
		this.apiKey = config.getOrThrow<string>('GEMINI_API_KEY');
		this.chatModel = config.get<string>('GEMINI_CHAT_MODEL', 'gemini-3.5-flash');
		this.embeddingModel = config.get<string>('GEMINI_EMBEDDING_MODEL', 'gemini-embedding-2');
		this.ttsModel = config.get<string>('GEMINI_TTS_MODEL', 'gemini-2.5-flash-preview-tts');
	}

	async speak(dialogue: string, speakers: Speaker[]): Promise<SpokenAudio> {
		const response = await fetch(
			`${BASE_URL}/models/${this.ttsModel}:generateContent?key=${this.apiKey}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				signal: AbortSignal.timeout(240_000),
				body: JSON.stringify({
					contents: [
						{ parts: [{ text: `Read the following dialogue aloud, naturally:\n\n${dialogue}` }] }
					],
					generationConfig: {
						responseModalities: ['AUDIO'],
						speechConfig: {
							multiSpeakerVoiceConfig: {
								speakerVoiceConfigs: speakers.map((s) => ({
									speaker: s.name,
									voiceConfig: { prebuiltVoiceConfig: { voiceName: s.voice } }
								}))
							}
						}
					}
				})
			}
		);

		if (!response.ok) {
			throw new ServiceUnavailableException(`Speech synthesis failed (${response.status})`);
		}

		const body = (await response.json()) as {
			candidates?: {
				content?: { parts?: { inlineData?: { data: string; mimeType: string } }[] };
			}[];
		};

		const inline = body.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
		if (!inline) throw new ServiceUnavailableException('The model returned no audio.');

		return {
			pcm: Buffer.from(inline.data, 'base64'),
			sampleRate: Number(/rate=(\d+)/.exec(inline.mimeType)?.[1] ?? 24000)
		};
	}

	async embed(texts: string[]): Promise<number[][]> {
		const requests = texts.map((text) => ({
			model: `models/${this.embeddingModel}`,
			content: { parts: [{ text }] },
			outputDimensionality: EMBEDDING_DIMENSIONS
		}));

		const response = await this.limiter.schedule(() =>
			fetch(`${BASE_URL}/models/${this.embeddingModel}:batchEmbedContents?key=${this.apiKey}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ requests })
			})
		);

		if (!response.ok) {
			throw new ServiceUnavailableException(`Embedding failed (${response.status})`);
		}

		const body = (await response.json()) as { embeddings: { values: number[] }[] };

		// embedding-2 arrives normalized, -001 at 768 does not (measured 0.59)
		return body.embeddings.map((embedding) => normalize(embedding.values));
	}

	async complete(prompt: string, options?: CompletionOptions): Promise<string> {
		const parts: string[] = [];
		for await (const chunk of this.stream(prompt, options)) parts.push(chunk);
		return parts.join('');
	}

	async *stream(prompt: string, options?: CompletionOptions): AsyncIterable<string> {
		const response = await fetch(
			`${BASE_URL}/models/${this.chatModel}:streamGenerateContent?alt=sse&key=${this.apiKey}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				signal: options?.signal,
				body: JSON.stringify({
					contents: [{ role: 'user', parts: [{ text: prompt }] }],
					systemInstruction: options?.system ? { parts: [{ text: options.system }] } : undefined,
					generationConfig: { temperature: options?.temperature ?? 0.2 }
				})
			}
		);

		if (!response.ok || !response.body) {
			throw new ServiceUnavailableException(`Model is not responding (${response.status})`);
		}

		for await (const text of readSseText(response.body)) yield text;
	}
}

async function* readSseText(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;

		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split('\n');
		buffer = lines.pop() ?? '';

		for (const line of lines) {
			if (!line.startsWith('data: ')) continue;

			const payload = line.slice(6).trim();
			if (payload === '[DONE]') return;

			const text = extractText(payload);
			if (text) yield text;
		}
	}
}

function extractText(payload: string): string | null {
	try {
		const parsed = JSON.parse(payload) as {
			candidates?: { content?: { parts?: { text?: string }[] } }[];
		};
		return parsed.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') || null;
	} catch {
		return null;
	}
}
