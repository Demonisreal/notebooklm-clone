import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from './jwt.guard';

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) => {
	return context.switchToHttp().getRequest<Request>().user as AuthUser;
});
