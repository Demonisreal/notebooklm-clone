import {
	CanActivate,
	ExecutionContext,
	Injectable,
	SetMetadata,
	UnauthorizedException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Request } from 'express';

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export type AuthUser = {
	id: string;
	email: string | null;
	token: string;
};

declare module 'express' {
	interface Request {
		user?: AuthUser;
	}
}

@Injectable()
export class JwtGuard implements CanActivate {
	private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
	private readonly issuer: string;

	constructor(
		private readonly reflector: Reflector,
		config: ConfigService
	) {
		this.issuer = config.getOrThrow<string>('SUPABASE_JWT_ISSUER');

		// the token names the public address, but the keys are fetched internally -
		// behind a proxy the container cannot reach itself otherwise
		const base = config.getOrThrow<string>('SUPABASE_URL');
		this.jwks = createRemoteJWKSet(new URL(`${base}/auth/v1/.well-known/jwks.json`));
	}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
			context.getHandler(),
			context.getClass()
		]);
		if (isPublic) return true;

		const request = context.switchToHttp().getRequest<Request>();
		const token = request.headers.authorization?.replace(/^Bearer /i, '');
		if (!token) throw new UnauthorizedException('No token provided');

		try {
			const { payload } = await jwtVerify(token, this.jwks, { issuer: this.issuer });
			request.user = {
				id: payload.sub as string,
				email: (payload.email as string) ?? null,
				token
			};
			return true;
		} catch {
			throw new UnauthorizedException('Token invalid or expired');
		}
	}
}
