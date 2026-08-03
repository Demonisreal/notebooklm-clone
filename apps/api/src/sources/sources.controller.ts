import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { createSourceSchema, uploadUrlSchema } from 'shared';
import type { CreateSourceInput, UploadUrlInput } from 'shared';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/jwt.guard';
import { ZodPipe } from '../zod.pipe';
import { SourcesService } from './sources.service';

@Controller()
export class SourcesController {
	constructor(private readonly sources: SourcesService) {}

	@Post('notebooks/:id/sources/upload-url')
	uploadUrl(
		@CurrentUser() user: AuthUser,
		@Param('id') notebookId: string,
		@Body(new ZodPipe(uploadUrlSchema)) body: UploadUrlInput
	) {
		return this.sources.createUploadUrl(user, notebookId, body.filename);
	}

	@Get('notebooks/:id/sources')
	list(@CurrentUser() user: AuthUser, @Param('id') notebookId: string) {
		return this.sources.list(user, notebookId);
	}

	@Post('notebooks/:id/sources')
	create(
		@CurrentUser() user: AuthUser,
		@Param('id') notebookId: string,
		@Body(new ZodPipe(createSourceSchema)) body: CreateSourceInput
	) {
		return this.sources.create(user, notebookId, body);
	}

	@Get('sources/:id/text')
	text(@CurrentUser() user: AuthUser, @Param('id') id: string) {
		return this.sources.text(user, id);
	}

	@Post('sources/:id/reprocess')
	@HttpCode(202)
	async reprocess(@CurrentUser() user: AuthUser, @Param('id') id: string) {
		await this.sources.reprocess(user, id);
	}

	@Delete('sources/:id')
	@HttpCode(204)
	async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
		await this.sources.remove(user, id);
	}
}
