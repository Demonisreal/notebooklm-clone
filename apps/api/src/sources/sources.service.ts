import { randomUUID } from 'node:crypto';
import {
	BadRequestException,
	Injectable,
	InternalServerErrorException,
	NotFoundException
} from '@nestjs/common';
import { extensionToKind, type CreateSourceInput, type Source, type SourceKind } from 'shared';
import type { AuthUser } from '../auth/jwt.guard';
import { SupabaseService } from '../supabase/supabase.service';
import { IngestionService } from './ingestion.service';

type Row = {
	id: string;
	notebook_id: string;
	title: string;
	kind: SourceKind;
	status: Source['status'];
	error_message: string | null;
	char_count: number | null;
	created_at: string;
};

const COLUMNS = 'id, notebook_id, title, kind, status, error_message, char_count, created_at';

type InsertRow = {
	notebook_id: string;
	user_id: string;
	status: 'pending';
	kind: SourceKind;
	title: string;
	source_url?: string;
	storage_path?: string;
	metadata?: { rawText: string };
};

function toSource(row: Row): Source {
	return {
		id: row.id,
		notebookId: row.notebook_id,
		title: row.title,
		kind: row.kind,
		status: row.status,
		errorMessage: row.error_message,
		charCount: row.char_count,
		createdAt: row.created_at
	};
}

@Injectable()
export class SourcesService {
	constructor(
		private readonly supabase: SupabaseService,
		private readonly ingestion: IngestionService
	) {}

	async createUploadUrl(user: AuthUser, notebookId: string, filename: string) {
		await this.assertOwnsNotebook(user, notebookId);

		const extension = filename.split('.').pop()?.toLowerCase() ?? '';
		if (!extensionToKind[extension]) {
			throw new BadRequestException(`File type .${extension} is not supported`);
		}

		// first path segment is the user id, that is what the storage policy checks
		const path = `${user.id}/${randomUUID()}.${extension}`;
		const { data, error } = await this.supabase
			.forUser(user.token)
			.storage.from('sources')
			.createSignedUploadUrl(path);

		if (error || !data) throw new InternalServerErrorException(error?.message);
		return {
			path,
			token: data.token,
			signedUrl: this.supabase.toPublicUrl(data.signedUrl)
		};
	}

	async list(user: AuthUser, notebookId: string): Promise<Source[]> {
		const { data, error } = await this.supabase
			.forUser(user.token)
			.from('sources')
			.select(COLUMNS)
			.eq('notebook_id', notebookId)
			.order('created_at');

		if (error) throw new InternalServerErrorException(error.message);
		return (data as Row[]).map(toSource);
	}

	async create(user: AuthUser, notebookId: string, input: CreateSourceInput): Promise<Source> {
		await this.assertOwnsNotebook(user, notebookId);

		const row = this.buildRow(user, notebookId, input);
		const { data, error } = await this.supabase
			.forUser(user.token)
			.from('sources')
			.insert(row)
			.select(COLUMNS)
			.single();

		if (error) throw new InternalServerErrorException(error.message);

		// without await on purpose: the client follows progress through the status
		void this.ingestion.run((data as Row).id);
		return toSource(data as Row);
	}

	async text(user: AuthUser, sourceId: string) {
		const { data, error } = await this.supabase
			.forUser(user.token)
			.from('sources')
			.select('id, title, kind, extracted_text')
			.eq('id', sourceId)
			.maybeSingle();

		if (error) throw new InternalServerErrorException(error.message);
		if (!data) throw new NotFoundException('Source not found');

		return {
			id: data.id,
			title: data.title,
			kind: data.kind,
			text: data.extracted_text ?? ''
		};
	}

	async remove(user: AuthUser, sourceId: string): Promise<void> {
		const { error } = await this.supabase
			.forUser(user.token)
			.from('sources')
			.delete()
			.eq('id', sourceId);

		if (error) throw new InternalServerErrorException(error.message);
	}

	async reprocess(user: AuthUser, sourceId: string): Promise<void> {
		const { data } = await this.supabase
			.forUser(user.token)
			.from('sources')
			.select('id')
			.eq('id', sourceId)
			.maybeSingle();

		if (!data) throw new NotFoundException('Source not found');
		void this.ingestion.run(sourceId);
	}

	private buildRow(user: AuthUser, notebookId: string, input: CreateSourceInput): InsertRow {
		const base = { notebook_id: notebookId, user_id: user.id, status: 'pending' as const };

		if (input.kind === 'url') {
			return { ...base, kind: 'url', source_url: input.url, title: input.url };
		}

		if (input.kind === 'text') {
			return { ...base, kind: 'text', title: input.title, metadata: { rawText: input.content } };
		}

		const extension = input.storagePath.split('.').pop()?.toLowerCase() ?? '';
		const kind = extensionToKind[extension];
		if (!kind) throw new BadRequestException(`File type .${extension} is not supported`);

		return { ...base, kind, title: input.title, storage_path: input.storagePath };
	}

	private async assertOwnsNotebook(user: AuthUser, notebookId: string) {
		const { data } = await this.supabase
			.forUser(user.token)
			.from('notebooks')
			.select('id')
			.eq('id', notebookId)
			.maybeSingle();

		if (!data) throw new NotFoundException('Notebook not found');
	}
}
