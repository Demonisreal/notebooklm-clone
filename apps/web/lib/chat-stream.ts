import type { ChatStreamEvent } from 'shared';
import { apiStream } from './api';

export async function* streamChat(
	notebookId: string,
	body: { message: string; conversationId?: string; sourceIds?: string[] },
	signal: AbortSignal
): AsyncIterable<ChatStreamEvent> {
	const response = await apiStream(`/notebooks/${notebookId}/chat`, body, signal);

	if (!response.ok || !response.body) {
		yield { type: 'error', message: 'Der Chat ist gerade nicht erreichbar.' };
		return;
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;

		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split('\n');
		// die letzte zeile kann unvollstaendig sein, die bleibt im puffer
		buffer = lines.pop() ?? '';

		for (const line of lines) {
			if (!line.startsWith('data: ')) continue;
			try {
				yield JSON.parse(line.slice(6)) as ChatStreamEvent;
			} catch {}
		}
	}
}
