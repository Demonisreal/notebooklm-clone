import { Module } from '@nestjs/common';
import { IngestionService } from './ingestion.service';
import { SourcesController } from './sources.controller';
import { SourcesService } from './sources.service';

@Module({
	controllers: [SourcesController],
	providers: [SourcesService, IngestionService]
})
export class SourcesModule {}
