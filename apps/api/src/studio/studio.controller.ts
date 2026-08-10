import { BadRequestException, Controller, Get, Param, Post } from '@nestjs/common';
import { studioKinds, type StudioKind } from 'shared';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/jwt.guard';
import { AudioService } from './audio.service';
import { StudioService } from './studio.service';

@Controller()
export class StudioController {
	constructor(
		private readonly studio: StudioService,
		private readonly audio: AudioService
	) {}

	@Get('notebooks/:id/studio/audio')
	audioOverview(@CurrentUser() user: AuthUser, @Param('id') notebookId: string) {
		return this.audio.get(user, notebookId);
	}

	@Post('notebooks/:id/studio/:kind')
	generate(
		@CurrentUser() user: AuthUser,
		@Param('id') notebookId: string,
		@Param('kind') kind: string
	) {
		if (!studioKinds.includes(kind as StudioKind)) {
			throw new BadRequestException(`Unbekannte Studio-Ausgabe: ${kind}`);
		}
		if (kind === 'audio') return this.audio.start(user, notebookId);

		return this.studio.generate(user, notebookId, kind as Exclude<StudioKind, 'audio'>);
	}
}
