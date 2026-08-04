import { Body, Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { chatRequestSchema } from 'shared';
import type { ChatRequestInput, ChatStreamEvent } from 'shared';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/jwt.guard';
import { ZodPipe } from '../zod.pipe';
import { ChatService } from './chat.service';

@Controller()
export class ChatController {
	constructor(private readonly chat: ChatService) {}

	@Post('notebooks/:id/chat')
	async ask(
		@CurrentUser() user: AuthUser,
		@Param('id') notebookId: string,
		@Body(new ZodPipe(chatRequestSchema)) body: ChatRequestInput,
		@Req() request: Request,
		@Res() response: Response
	) {
		response.set({
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
			// proxies puffern sse sonst und der stream kommt stockend an
			'X-Accel-Buffering': 'no'
		});
		response.flushHeaders();

		const controller = new AbortController();
		request.on('close', () => controller.abort());

		try {
			for await (const event of this.chat.ask(user, notebookId, body, controller.signal)) {
				if (controller.signal.aborted) break;
				write(response, event);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unerwarteter Fehler';
			if (!controller.signal.aborted) write(response, { type: 'error', message });
		} finally {
			response.end();
		}
	}

	@Get('notebooks/:id/conversations')
	conversations(@CurrentUser() user: AuthUser, @Param('id') notebookId: string) {
		return this.chat.conversations(user, notebookId);
	}

	@Get('conversations/:id/messages')
	messages(@CurrentUser() user: AuthUser, @Param('id') conversationId: string) {
		return this.chat.messages(user, conversationId);
	}
}

function write(response: Response, event: ChatStreamEvent) {
	response.write(`data: ${JSON.stringify(event)}\n\n`);
}
