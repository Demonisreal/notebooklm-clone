import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { TRUSTED_PROXIES } from './auth/demo-limit.guard';

async function bootstrap() {
	const app = await NestFactory.create<NestExpressApplication>(AppModule);
	const config = app.get(ConfigService);

	// request.ip has to be the visitor behind caddy, the demo limits are counted per address
	app.set('trust proxy', TRUSTED_PROXIES);

	app.enableCors({
		origin: config.get<string>('WEB_ORIGIN', 'http://localhost:3000'),
		credentials: true
	});

	await app.listen(config.get<number>('PORT', 3001));
}

void bootstrap();
