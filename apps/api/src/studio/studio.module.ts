import { Module } from '@nestjs/common';
import { NotesModule } from '../notes/notes.module';
import { AudioService } from './audio.service';
import { StudioController } from './studio.controller';
import { StudioService } from './studio.service';

@Module({
	imports: [NotesModule],
	controllers: [StudioController],
	providers: [StudioService, AudioService]
})
export class StudioModule {}
