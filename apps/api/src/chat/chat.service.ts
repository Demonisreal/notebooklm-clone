import {
	Inject,
	Injectable,
	InternalServerErrorException,
	NotFoundException
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatMessage, ChatRequestInput, ChatStreamEvent, Citation } from 'shared';
import type { AuthUser } from '../auth/jwt.guard';
import { LLM_PROVIDER, LlmProvider } from '../llm/llm.provider';
import { SupabaseService } from '../supabase/supabase.service';
import { resolveCitations } from './citations';
import { buildPrompt, SYSTEM_PROMPT } from './prompt';
import { RetrievalService } from './retrieval.service';

@Injectable()
export class ChatService {
	constructor(
		private readonly supabase: SupabaseService,
		private readonly retrieval: RetrievalService,
		@Inject(LLM_PROVIDER) private readonly llm: LlmProvider
	) {}

	async *ask(
		user: AuthUser,
		notebookId: string,
		input: ChatRequestInput,
		signal: AbortSignal
	): AsyncIterable<ChatStreamEvent> {
		const db = this.supabase.forUser(user.token);

		const conversationId = await this.conversation(db, user, notebookId, input);
		await this.saveMessage(db, conversationId, 'user', input.message, []);

		const blocks = await this.retrieval.search(db, notebookId, input.message, input.sourceIds);
		const prompt = buildPrompt(input.message, blocks);

		const assistantId = crypto.randomUUID();
		yield { type: 'meta', conversationId, messageId: assistantId };

		let raw = '';
		try {
			for await (const delta of this.llm.stream(prompt, { system: SYSTEM_PROMPT, signal })) {
				raw += delta;
				yield { type: 'delta', text: delta };
			}
		} catch (error) {
			if (signal.aborted) return;
			yield { type: 'error', message: 'Das Modell hat die Antwort abgebrochen.' };
			return;
		}

		// bei abbruch nichts speichern, sonst steht eine halbe antwort im verlauf
		if (signal.aborted) return;

		const { text, citations } = resolveCitations(raw, blocks);
		yield { type: 'citations', items: citations };

		await this.saveMessage(db, conversationId, 'assistant', text, citations);
		yield { type: 'done' };
	}

	async conversations(user: AuthUser, notebookId: string) {
		const { data, error } = await this.supabase
			.forUser(user.token)
			.from('conversations')
			.select('id, title, created_at')
			.eq('notebook_id', notebookId)
			.order('created_at', { ascending: false });

		if (error) throw new InternalServerErrorException(error.message);
		return data;
	}

	async messages(user: AuthUser, conversationId: string): Promise<ChatMessage[]> {
		const { data, error } = await this.supabase
			.forUser(user.token)
			.from('messages')
			.select('id, role, content, citations, created_at')
			.eq('conversation_id', conversationId)
			.order('created_at');

		if (error) throw new InternalServerErrorException(error.message);

		return (data ?? []).map((row) => ({
			id: row.id as string,
			role: row.role as 'user' | 'assistant',
			content: row.content as string,
			citations: (row.citations ?? []) as Citation[],
			createdAt: row.created_at as string
		}));
	}

	private async conversation(
		db: SupabaseClient,
		user: AuthUser,
		notebookId: string,
		input: ChatRequestInput
	): Promise<string> {
		if (input.conversationId) return input.conversationId;

		const { data, error } = await db
			.from('conversations')
			.insert({
				notebook_id: notebookId,
				user_id: user.id,
				title: input.message.slice(0, 80)
			})
			.select('id')
			.single();

		if (error || !data) throw new NotFoundException('Notizbuch nicht gefunden');
		return data.id as string;
	}

	private async saveMessage(
		db: SupabaseClient,
		conversationId: string,
		role: 'user' | 'assistant',
		content: string,
		citations: Citation[]
	) {
		const { error } = await db
			.from('messages')
			.insert({ conversation_id: conversationId, role, content, citations });

		if (error) throw new InternalServerErrorException(error.message);
	}
}
