import {
	CanActivate,
	ExecutionContext,
	HttpException,
	HttpStatus,
	Injectable,
	SetMetadata
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { DemoLimitService, type DemoBucket } from './demo-limit.service';
import type { AuthUser } from './jwt.guard';

export const DEMO_LIMIT = 'demoLimit';
export const DemoLimit = (bucket: DemoBucket) => SetMetadata(DEMO_LIMIT, bucket);

// Caddy reaches the api over the docker network, so only private peers may set
// X-Forwarded-For. Caddy replaces the header instead of appending to it, and even if it
// appended, express takes the rightmost untrusted entry, never the client-controlled first one.
export const TRUSTED_PROXIES = 'loopback, uniquelocal';

@Injectable()
export class DemoLimitGuard implements CanActivate {
	private readonly demoEmail: string | null;

	constructor(
		private readonly reflector: Reflector,
		private readonly limits: DemoLimitService,
		config: ConfigService
	) {
		this.demoEmail = config.get<string>('DEMO_USER_EMAIL')?.toLowerCase() ?? null;
	}

	canActivate(context: ExecutionContext): boolean {
		if (!this.demoEmail) return true;

		const bucket = this.reflector.getAllAndOverride<DemoBucket | undefined>(DEMO_LIMIT, [
			context.getHandler(),
			context.getClass()
		]);
		if (!bucket) return true;

		const request = context.switchToHttp().getRequest<Request>();
		const user: AuthUser | undefined = request.user;
		if (user?.email?.toLowerCase() !== this.demoEmail) return true;

		const limit = this.limits.take(bucket, request.ip ?? '');
		if (limit === 'hourly') {
			const what = bucket === 'chat' ? 'chat questions' : 'studio generations';
			throw new HttpException(
				`Demo limit reached: too many ${what} from your address in the last hour. Please try again later.`,
				HttpStatus.TOO_MANY_REQUESTS
			);
		}
		if (limit === 'daily') {
			throw new HttpException(
				'The demo has used up its budget for today. Please try again tomorrow.',
				HttpStatus.TOO_MANY_REQUESTS
			);
		}
		return true;
	}
}
