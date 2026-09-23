import type { ConfigService } from '@nestjs/config';
import type { AuthUser } from './jwt.guard';

export function demoEmail(config: ConfigService): string | null {
	return config.get<string>('DEMO_USER_EMAIL')?.toLowerCase() ?? null;
}

export function isDemo(user: AuthUser | undefined, demoEmail: string | null): boolean {
	return !!demoEmail && user?.email?.toLowerCase() === demoEmail;
}
