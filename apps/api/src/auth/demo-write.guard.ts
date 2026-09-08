import {
	CanActivate,
	ExecutionContext,
	ForbiddenException,
	Injectable,
	SetMetadata
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthUser } from './jwt.guard';

export const BLOCK_FOR_DEMO = 'blockForDemo';
export const BlockForDemo = () => SetMetadata(BLOCK_FOR_DEMO, true);

@Injectable()
export class DemoWriteGuard implements CanActivate {
	private readonly demoEmail: string | null;

	constructor(
		private readonly reflector: Reflector,
		config: ConfigService
	) {
		// without a demo account the guard never fires, nothing should differ locally
		this.demoEmail = config.get<string>('DEMO_USER_EMAIL')?.toLowerCase() ?? null;
	}

	canActivate(context: ExecutionContext): boolean {
		if (!this.demoEmail) return true;

		const blocked = this.reflector.getAllAndOverride<boolean>(BLOCK_FOR_DEMO, [
			context.getHandler(),
			context.getClass()
		]);
		if (!blocked) return true;

		const user: AuthUser | undefined = context.switchToHttp().getRequest<Request>().user;
		if (user?.email?.toLowerCase() !== this.demoEmail) return true;

		throw new ForbiddenException(
			'The demo access is read only: sources and notebooks cannot be changed here. Chat and studio work as usual.'
		);
	}
}
