import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
	const app = await NestFactory.create(AppModule);
	const config = app.get(ConfigService);

	app.enableCors({
		origin: config.get<string>('WEB_ORIGIN', 'http://localhost:3000'),
		credentials: true
	});

	await app.listen(config.get<number>('PORT', 3001));
}

void bootstrap();
