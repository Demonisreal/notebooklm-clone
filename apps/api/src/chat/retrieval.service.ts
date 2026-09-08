import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { LLM_PROVIDER, LlmProvider } from '../llm/llm.provider';
import type { ContextBlock } from './citations';

const TOP_K = 8;

type MatchRow = {
	id: string;
	source_id: string;
	content: string;
	page: number | null;
	char_start: number;
	char_end: number;
};

@Injectable()
export class RetrievalService {
	constructor(@Inject(LLM_PROVIDER) private readonly llm: LlmProvider) {}

	async search(
		db: SupabaseClient,
		notebookId: string,
		question: string,
		sourceIds?: string[]
	): Promise<ContextBlock[]> {
		const [embedding] = await this.llm.embed([question]);

		const { data, error } = await db.rpc('match_chunks', {
			p_notebook_id: notebookId,
			p_source_ids: sourceIds?.length ? sourceIds : null,
			p_query_embedding: JSON.stringify(embedding),
			p_query_text: question,
			p_limit: TOP_K
		});

		if (error) throw new InternalServerErrorException(error.message);

		const rows = (data ?? []) as MatchRow[];
		if (rows.length === 0) return [];

		const titles = await this.titles(
			db,
			rows.map((r) => r.source_id)
		);

		return rows.map((row) => ({
			chunkId: row.id,
			sourceId: row.source_id,
			sourceTitle: titles.get(row.source_id) ?? 'Untitled source',
			page: row.page,
			charStart: row.char_start,
			charEnd: row.char_end,
			content: row.content
		}));
	}

	private async titles(db: SupabaseClient, sourceIds: string[]) {
		const { data } = await db
			.from('sources')
			.select('id, title')
			.in('id', [...new Set(sourceIds)]);

		return new Map((data ?? []).map((row) => [row.id as string, row.title as string]));
	}
}
