import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { createNoteSchema, updateNoteSchema } from 'shared';
import type { CreateNoteInput, UpdateNoteInput } from 'shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { BlockForDemo } from '../auth/demo-write.guard';
import type { AuthUser } from '../auth/jwt.guard';
import { ZodPipe } from '../zod.pipe';
import { NotesService } from './notes.service';

@Controller()
export class NotesController {
	constructor(private readonly notes: NotesService) {}

	@Get('notebooks/:id/notes')
	list(@CurrentUser() user: AuthUser, @Param('id') notebookId: string) {
		return this.notes.list(user, notebookId);
	}

	@BlockForDemo()
	@Post('notebooks/:id/notes')
	create(
		@CurrentUser() user: AuthUser,
		@Param('id') notebookId: string,
		@Body(new ZodPipe(createNoteSchema)) body: CreateNoteInput
	) {
		return this.notes.create(user, notebookId, body);
	}

	@BlockForDemo()
	@Patch('notes/:id')
	update(
		@CurrentUser() user: AuthUser,
		@Param('id') id: string,
		@Body(new ZodPipe(updateNoteSchema)) body: UpdateNoteInput
	) {
		return this.notes.update(user, id, body);
	}

	@BlockForDemo()
	@Delete('notes/:id')
	@HttpCode(204)
	async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
		await this.notes.remove(user, id);
	}
}
