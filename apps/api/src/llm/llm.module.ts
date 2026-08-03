import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FakeProvider } from './fake.provider';
import { GeminiProvider } from './gemini.provider';
import { LLM_PROVIDER, LlmProvider } from './llm.provider';

@Global()
@Module({
	providers: [
		{
			provide: LLM_PROVIDER,
			inject: [ConfigService],
			useFactory: (config: ConfigService): LlmProvider => {
				const provider = config.get<string>('LLM_PROVIDER', 'fake');
				if (provider === 'gemini') return new GeminiProvider(config);
				return new FakeProvider();
			}
		}
	],
	exports: [LLM_PROVIDER]
})
export class LlmModule {}
