import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import type { CreateNoteInput, Note, NoteOrigin, UpdateNoteInput } from 'shared';
import type { AuthUser } from '../auth/jwt.guard';
import { SupabaseService } from '../supabase/supabase.service';

type Row = {
	id: string;
	notebook_id: string;
	title: string | null;
	content: string;
	origin: NoteOrigin;
	created_at: string;
};

const COLUMNS = 'id, notebook_id, title, content, origin, created_at';

function toNote(row: Row): Note {
	return {
		id: row.id,
		notebookId: row.notebook_id,
		title: row.title,
		content: row.content,
		origin: row.origin,
		createdAt: row.created_at
	};
}

@Injectable()
export class NotesService {
	constructor(private readonly supabase: SupabaseService) {}

	async list(user: AuthUser, notebookId: string): Promise<Note[]> {
		const { data, error } = await this.supabase
			.forUser(user.token)
			.from('notes')
			.select(COLUMNS)
			.eq('notebook_id', notebookId)
			.order('created_at', { ascending: false });

		if (error) throw new InternalServerErrorException(error.message);
		return (data as Row[]).map(toNote);
	}

	async create(user: AuthUser, notebookId: string, input: CreateNoteInput): Promise<Note> {
		const { data, error } = await this.supabase
			.forUser(user.token)
			.from('notes')
			.insert({
				notebook_id: notebookId,
				user_id: user.id,
				title: input.title ?? null,
				content: input.content,
				origin: input.origin
			})
			.select(COLUMNS)
			.single();

		if (error) throw new InternalServerErrorException(error.message);
		return toNote(data as Row);
	}

	async update(user: AuthUser, id: string, input: UpdateNoteInput): Promise<Note> {
		const { data, error } = await this.supabase
			.forUser(user.token)
			.from('notes')
			.update(input)
			.eq('id', id)
			.select(COLUMNS)
			.maybeSingle();

		if (error) throw new InternalServerErrorException(error.message);
		if (!data) throw new NotFoundException('Note not found');
		return toNote(data as Row);
	}

	async remove(user: AuthUser, id: string): Promise<void> {
		const { error } = await this.supabase.forUser(user.token).from('notes').delete().eq('id', id);
		if (error) throw new InternalServerErrorException(error.message);
	}
}
