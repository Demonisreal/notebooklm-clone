import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { createNotebookSchema, updateNotebookSchema } from 'shared';
import type { CreateNotebookInput, UpdateNotebookInput } from 'shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { BlockForDemo } from '../auth/demo-write.guard';
import type { AuthUser } from '../auth/jwt.guard';
import { ZodPipe } from '../zod.pipe';
import { NotebooksService } from './notebooks.service';

@Controller('notebooks')
export class NotebooksController {
	constructor(private readonly notebooks: NotebooksService) {}

	@Get()
	list(@CurrentUser() user: AuthUser) {
		return this.notebooks.list(user);
	}

	@BlockForDemo()
	@Post()
	create(
		@CurrentUser() user: AuthUser,
		@Body(new ZodPipe(createNotebookSchema)) body: CreateNotebookInput
	) {
		return this.notebooks.create(user, body);
	}

	@BlockForDemo()
	@Patch(':id')
	update(
		@CurrentUser() user: AuthUser,
		@Param('id') id: string,
		@Body(new ZodPipe(updateNotebookSchema)) body: UpdateNotebookInput
	) {
		return this.notebooks.update(user, id, body);
	}

	@BlockForDemo()
	@Delete(':id')
	@HttpCode(204)
	async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
		await this.notebooks.remove(user, id);
	}
}
