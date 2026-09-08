import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { BlockForDemo, DemoWriteGuard } from './demo-write.guard';

class Routes {
	@BlockForDemo()
	remove() {}

	ask() {}
}

function guard(demoEmail?: string) {
	return new DemoWriteGuard(new Reflector(), new ConfigService({ DEMO_USER_EMAIL: demoEmail }));
}

function context(handler: () => void, email: string | null) {
	return {
		getHandler: () => handler,
		getClass: () => Routes,
		switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u1', email, token: 't' } }) })
	} as unknown as ExecutionContext;
}

const routes = new Routes();

describe('DemoWriteGuard', () => {
	it('blocks the demo account on writing routes, whatever the casing', () => {
		const demo = context(routes.remove, 'demo@notebook.test');
		const call = () => guard('Demo@notebook.test').canActivate(demo);
		expect(call).toThrow(ForbiddenException);
	});

	it('lets chat and studio through, they are the point of the demo', () => {
		expect(guard('demo@notebook.test').canActivate(context(routes.ask, 'demo@notebook.test'))).toBe(
			true
		);
	});

	it('lets other accounts write', () => {
		expect(
			guard('demo@notebook.test').canActivate(context(routes.remove, 'boss@company.test'))
		).toBe(true);
	});

	it('stops nobody where no demo address is configured', () => {
		expect(guard().canActivate(context(routes.remove, 'demo@notebook.test'))).toBe(true);
	});
});
