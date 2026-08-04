import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { RetrievalService } from './retrieval.service';

@Module({
	controllers: [ChatController],
	providers: [ChatService, RetrievalService],
	exports: [RetrievalService]
})
export class ChatModule {}
