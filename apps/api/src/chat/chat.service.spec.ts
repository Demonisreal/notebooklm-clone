import { ConfigService } from '@nestjs/config';
import type { ChatStreamEvent } from 'shared';
import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../auth/jwt.guard';
import type { ContextBlock } from './citations';
import { ChatService } from './chat.service';

const demo: AuthUser = { id: 'u-demo', email: 'Demo@notebook.test', token: 't' };
const boss: AuthUser = { id: 'u-boss', email: 'boss@company.test', token: 't' };

const warranty: ContextBlock = {
	chunkId: 'chunk-1',
	sourceId: 'source-1',
	sourceTitle: 'Framework agreement',
	page: 2,
	charStart: 0,
	charEnd: 32,
	content: 'The warranty runs for 24 months.'
};

function service() {
	const inserts: { table: string; row: Record<string, unknown> }[] = [];
	const from = vi.fn((table: string) => ({
		insert(row: Record<string, unknown>) {
			inserts.push({ table, row });
			// messages await the insert itself, the new conversation chains select().single()
			return {
				select: () => ({ single: async () => ({ data: { id: 'c-new' }, error: null }) }),
				then: (done: (value: { error: null }) => void) => done({ error: null })
			};
		},
		select: () => ({
			eq: () => ({
				order: async () => ({ data: [{ id: 'c-old', title: 'Earlier' }], error: null })
			})
		})
	}));

	const chat = new ChatService(
		{ forUser: () => ({ from }) } as never,
		{ search: async () => [warranty] } as never,
		{
			async *stream() {
				yield 'It runs for 24 months [1].';
			}
		} as never,
		new ConfigService({ DEMO_USER_EMAIL: 'demo@notebook.test' })
	);
	return { chat, from, inserts };
}

async function ask(chat: ChatService, user: AuthUser, conversationId?: string) {
	const events: ChatStreamEvent[] = [];
	const input = { message: 'How long is the warranty?', conversationId };
	for await (const event of chat.ask(user, 'n1', input, new AbortController().signal)) {
		events.push(event);
	}
	return events;
}

describe('ChatService', () => {
	it('answers the demo account without storing question or answer', async () => {
		const { chat, from } = service();
		const events = await ask(chat, demo);

		expect(events.map((event) => event.type)).toEqual(['meta', 'delta', 'citations', 'done']);
		expect(from).not.toHaveBeenCalled();
	});

	it('writes nothing for the demo account even with a conversation id from the client', async () => {
		const { chat, from } = service();
		const foreign = '6f1c4c1e-5b1a-4a57-9a43-2f0d6c2b7e11';
		const events = await ask(chat, demo, foreign);

		expect(events[0]).toMatchObject({ type: 'meta', conversationId: foreign });
		expect(from).not.toHaveBeenCalled();
	});

	it('keeps the history of other accounts', async () => {
		const { chat, inserts } = service();
		await ask(chat, boss);

		expect(inserts.map((insert) => insert.table)).toEqual([
			'conversations',
			'messages',
			'messages'
		]);
		expect(inserts[0].row).toMatchObject({ user_id: 'u-boss', title: 'How long is the warranty?' });
		expect(inserts[2].row).toMatchObject({ conversation_id: 'c-new', role: 'assistant' });
	});

	it('hands the demo account no stored chats, other accounts still get theirs', async () => {
		const { chat, from } = service();

		expect(await chat.conversations(demo, 'n1')).toEqual([]);
		expect(await chat.messages(demo, 'c-old')).toEqual([]);
		expect(from).not.toHaveBeenCalled();

		expect(await chat.conversations(boss, 'n1')).toHaveLength(1);
	});
});
