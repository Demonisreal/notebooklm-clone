import { BadRequestException, Controller, Param, Post } from '@nestjs/common';
import { studioKinds, type StudioKind } from 'shared';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/jwt.guard';
import { StudioService } from './studio.service';

@Controller()
export class StudioController {
	constructor(private readonly studio: StudioService) {}

	@Post('notebooks/:id/studio/:kind')
	generate(
		@CurrentUser() user: AuthUser,
		@Param('id') notebookId: string,
		@Param('kind') kind: string
	) {
		if (!studioKinds.includes(kind as StudioKind)) {
			throw new BadRequestException(`Unbekannte Studio-Ausgabe: ${kind}`);
		}
		return this.studio.generate(user, notebookId, kind as StudioKind);
	}
}
