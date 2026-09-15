import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type DemoBucket = 'chat' | 'studio';

const HOUR = 60 * 60 * 1000;
const SWEEP_EVERY = 10 * 60 * 1000;

// the day flips at midnight in Berlin, not UTC, so the reset lands where the operator expects it
const berlinDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' });

// Counters live in memory: there is exactly one api container, and a restart that hands
// out a fresh budget is acceptable for a demo. From a second container on this needs Postgres.
@Injectable()
export class DemoLimitService {
	private readonly perHour: Record<DemoBucket, number>;
	private readonly dailyCap: number;

	private readonly hits = new Map<string, number[]>();
	private day = '';
	private usedToday = 0;
	private lastSweep = Date.now();

	constructor(config: ConfigService) {
		this.perHour = {
			chat: config.getOrThrow<number>('DEMO_CHAT_PER_HOUR'),
			studio: config.getOrThrow<number>('DEMO_STUDIO_PER_HOUR')
		};
		this.dailyCap = config.getOrThrow<number>('DEMO_DAILY_CAP');
	}

	// null means counted and let through, otherwise the limit that stopped it
	take(bucket: DemoBucket, ip: string): 'hourly' | 'daily' | null {
		const now = Date.now();
		this.sweep(now);

		const key = `${bucket}:${ip}`;
		const recent = (this.hits.get(key) ?? []).filter((time) => time > now - HOUR);
		if (recent.length >= this.perHour[bucket]) return 'hourly';

		const today = berlinDay.format(now);
		if (today !== this.day) {
			this.day = today;
			this.usedToday = 0;
		}
		// refused requests are not counted, otherwise one flooding address would eat the daily budget
		if (this.usedToday >= this.dailyCap) return 'daily';

		recent.push(now);
		this.hits.set(key, recent);
		this.usedToday++;
		return null;
	}

	private sweep(now: number) {
		if (now - this.lastSweep < SWEEP_EVERY) return;
		this.lastSweep = now;

		for (const [key, times] of this.hits) {
			if (times[times.length - 1] <= now - HOUR) this.hits.delete(key);
		}
	}
}
