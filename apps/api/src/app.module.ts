import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { DemoWriteGuard } from './auth/demo-write.guard';
import { JwtGuard } from './auth/jwt.guard';
import { loadConfig } from './config';
import { LlmModule } from './llm/llm.module';
import { ChatModule } from './chat/chat.module';
import { NotebooksModule } from './notebooks/notebooks.module';
import { NotesModule } from './notes/notes.module';
import { SourcesModule } from './sources/sources.module';
import { StudioModule } from './studio/studio.module';
import { SupabaseModule } from './supabase/supabase.module';

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			// absolut, damit der start nicht vom arbeitsverzeichnis abhaengt
			envFilePath: join(__dirname, '..', '.env'),
			validate: loadConfig
		}),
		SupabaseModule,
		LlmModule,
		NotebooksModule,
		SourcesModule,
		ChatModule,
		NotesModule,
		StudioModule
	],
	// reihenfolge zaehlt: erst der JwtGuard, der request.user setzt
	providers: [
		{ provide: APP_GUARD, useClass: JwtGuard },
		{ provide: APP_GUARD, useClass: DemoWriteGuard }
	]
})
export class AppModule {}
