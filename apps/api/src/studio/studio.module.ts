import { Module } from '@nestjs/common';
import { NotesModule } from '../notes/notes.module';
import { StudioController } from './studio.controller';
import { StudioService } from './studio.service';

@Module({
	imports: [NotesModule],
	controllers: [StudioController],
	providers: [StudioService]
})
export class StudioModule {}
