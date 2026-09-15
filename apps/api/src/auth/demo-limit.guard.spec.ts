import { HttpException, type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import type { Request } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoLimit, DemoLimitGuard, TRUSTED_PROXIES } from './demo-limit.guard';
import { DemoLimitService } from './demo-limit.service';

class Routes {
	@DemoLimit('chat')
	ask() {}

	@DemoLimit('studio')
	generate() {}

	list() {}
}

const routes = new Routes();
const DEMO = 'demo@notebook.test';

function guard(env: Record<string, unknown> = {}) {
	const config = new ConfigService({
		DEMO_USER_EMAIL: DEMO,
		DEMO_CHAT_PER_HOUR: 10,
		DEMO_STUDIO_PER_HOUR: 3,
		DEMO_DAILY_CAP: 200,
		...env
	});
	return new DemoLimitGuard(new Reflector(), new DemoLimitService(config), config);
}

function context(handler: () => void, email: string | null, ip: string) {
	return {
		getHandler: () => handler,
		getClass: () => Routes,
		switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u1', email, token: 't' }, ip }) })
	} as unknown as ExecutionContext;
}

function status(call: () => unknown) {
	try {
		call();
	} catch (error) {
		return error instanceof HttpException ? error.getStatus() : error;
	}
	return 'passed';
}

describe('DemoLimitGuard', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-09-15T10:00:00Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('lets the demo account ask while it stays under the hourly limit', () => {
		const limits = guard();
		for (let i = 0; i < 10; i++) {
			expect(limits.canActivate(context(routes.ask, DEMO, '203.0.113.7'))).toBe(true);
		}
	});

	it('answers 429 once one address is over its hourly limit, other addresses carry on', () => {
		const limits = guard();
		for (let i = 0; i < 3; i++) limits.canActivate(context(routes.generate, DEMO, '203.0.113.7'));

		expect(status(() => limits.canActivate(context(routes.generate, DEMO, '203.0.113.7')))).toBe(
			429
		);
		expect(status(() => limits.canActivate(context(routes.generate, DEMO, '198.51.100.4')))).toBe(
			'passed'
		);
		// chat has a budget of its own
		expect(status(() => limits.canActivate(context(routes.ask, DEMO, '203.0.113.7')))).toBe(
			'passed'
		);

		vi.advanceTimersByTime(60 * 60 * 1000 + 1);
		expect(status(() => limits.canActivate(context(routes.generate, DEMO, '203.0.113.7')))).toBe(
			'passed'
		);
	});

	it('stops every address once the daily cap is used up, until midnight in Berlin', () => {
		// 23:50 in Berlin
		vi.setSystemTime(new Date('2026-09-15T21:50:00Z'));
		const limits = guard({ DEMO_DAILY_CAP: 3 });
		for (const ip of ['10.0.0.1', '10.0.0.2', '10.0.0.3']) {
			limits.canActivate(context(routes.ask, DEMO, ip));
		}

		expect(status(() => limits.canActivate(context(routes.ask, DEMO, '10.0.0.4')))).toBe(429);

		vi.setSystemTime(new Date('2026-09-15T22:00:00Z'));
		expect(status(() => limits.canActivate(context(routes.ask, DEMO, '10.0.0.4')))).toBe('passed');
	});

	it('never limits other accounts', () => {
		const limits = guard({ DEMO_DAILY_CAP: 1 });
		for (let i = 0; i < 50; i++) {
			expect(limits.canActivate(context(routes.generate, 'boss@company.test', '203.0.113.7'))).toBe(
				true
			);
		}
	});

	it('does not count routes without a limit', () => {
		const limits = guard({ DEMO_DAILY_CAP: 1 });
		for (let i = 0; i < 5; i++) limits.canActivate(context(routes.list, DEMO, '203.0.113.7'));

		expect(limits.canActivate(context(routes.ask, 'Demo@notebook.test', '203.0.113.7'))).toBe(true);
	});

	it('stays inert where no demo address is configured', () => {
		const limits = guard({ DEMO_USER_EMAIL: undefined, DEMO_DAILY_CAP: 1 });
		for (let i = 0; i < 5; i++) {
			expect(limits.canActivate(context(routes.ask, DEMO, '203.0.113.7'))).toBe(true);
		}
	});
});

describe('client address behind caddy', () => {
	function ip(peer: string, forwardedFor?: string) {
		const app = new ExpressAdapter().getInstance();
		app.set('trust proxy', TRUSTED_PROXIES);

		const request = Object.create(app.request) as Request;
		Object.assign(request, {
			headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {},
			socket: { remoteAddress: peer }
		});
		return request.ip;
	}

	it('takes the forwarded address when caddy sits on the docker network', () => {
		expect(ip('172.18.0.5', '203.0.113.7')).toBe('203.0.113.7');
		expect(ip('::ffff:172.18.0.5', '203.0.113.7')).toBe('203.0.113.7');
	});

	it('ignores the header from a peer that is not a proxy', () => {
		expect(ip('198.51.100.4', '203.0.113.7')).toBe('198.51.100.4');
	});

	it('does not believe an entry the client put in front', () => {
		expect(ip('172.18.0.5', '1.2.3.4, 203.0.113.7')).toBe('203.0.113.7');
	});
});
