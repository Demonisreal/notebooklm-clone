import { z } from 'zod';

export const chatRequestSchema = z.object({
	message: z.string().trim().min(1).max(4000),
	conversationId: z.string().uuid().optional(),
	// empty means all sources, not none
	sourceIds: z.array(z.string().uuid()).optional()
});

export type ChatRequestInput = z.infer<typeof chatRequestSchema>;

export type Citation = {
	n: number;
	chunkId: string;
	sourceId: string;
	sourceTitle: string;
	page: number | null;
	charStart: number;
	charEnd: number;
	snippet: string;
};

export type ChatStreamEvent =
	| { type: 'meta'; conversationId: string; messageId: string }
	| { type: 'delta'; text: string }
	// cleaned up version - the stream itself carries raw model output
	| { type: 'citations'; text: string; items: Citation[] }
	| { type: 'error'; message: string }
	| { type: 'done' };

export type ChatMessage = {
	id: string;
	role: 'user' | 'assistant';
	content: string;
	citations: Citation[];
	createdAt: string;
};
