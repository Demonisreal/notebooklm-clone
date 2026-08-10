import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import type { CreateNotebookInput, Notebook, UpdateNotebookInput } from 'shared';
import { SupabaseService } from '../supabase/supabase.service';
import type { AuthUser } from '../auth/jwt.guard';

type Row = {
	id: string;
	title: string;
	emoji: string;
	created_at: string;
	updated_at: string;
	sources?: { count: number }[];
};

const COLUMNS = 'id, title, emoji, created_at, updated_at, sources(count)';

function toNotebook(row: Row): Notebook {
	return {
		id: row.id,
		title: row.title,
		emoji: row.emoji,
		sourceCount: row.sources?.[0]?.count ?? 0,
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}

@Injectable()
export class NotebooksService {
	constructor(private readonly supabase: SupabaseService) {}

	async list(user: AuthUser): Promise<Notebook[]> {
		const { data, error } = await this.supabase
			.forUser(user.token)
			.from('notebooks')
			.select(COLUMNS)
			.order('updated_at', { ascending: false });

		if (error) throw new InternalServerErrorException(error.message);
		return (data as Row[]).map(toNotebook);
	}

	async create(user: AuthUser, input: CreateNotebookInput): Promise<Notebook> {
		const { data, error } = await this.supabase
			.forUser(user.token)
			.from('notebooks')
			.insert({ user_id: user.id, title: input.title, emoji: input.emoji ?? '📓' })
			.select(COLUMNS)
			.single();

		if (error) throw new InternalServerErrorException(error.message);
		return toNotebook(data as Row);
	}

	async update(user: AuthUser, id: string, input: UpdateNotebookInput): Promise<Notebook> {
		const { data, error } = await this.supabase
			.forUser(user.token)
			.from('notebooks')
			.update({ ...input, updated_at: new Date().toISOString() })
			.eq('id', id)
			.select(COLUMNS)
			.maybeSingle();

		if (error) throw new InternalServerErrorException(error.message);
		if (!data) throw new NotFoundException('Notizbuch nicht gefunden');
		return toNotebook(data as Row);
	}

	async remove(user: AuthUser, id: string): Promise<void> {
		const { error } = await this.supabase
			.forUser(user.token)
			.from('notebooks')
			.delete()
			.eq('id', id);

		if (error) throw new InternalServerErrorException(error.message);
	}
}
