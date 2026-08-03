import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
	private readonly url: string;
	private readonly publishableKey: string;
	private readonly admin: SupabaseClient;

	constructor(config: ConfigService) {
		this.url = config.getOrThrow<string>('SUPABASE_URL');
		this.publishableKey = config.getOrThrow<string>('SUPABASE_PUBLISHABLE_KEY');
		this.admin = createClient(this.url, config.getOrThrow<string>('SUPABASE_SECRET_KEY'), {
			auth: { persistSession: false, autoRefreshToken: false }
		});
	}

	// mit dem user-token greift rls auf db-ebene, ein fehler im controller
	// fuehrt dann nicht sofort zum datenleck
	forUser(token: string): SupabaseClient {
		return createClient(this.url, this.publishableKey, {
			auth: { persistSession: false, autoRefreshToken: false },
			global: { headers: { Authorization: `Bearer ${token}` } }
		});
	}

	// nur fuer die ingestion, wo kein user-kontext mehr existiert
	asAdmin(): SupabaseClient {
		return this.admin;
	}
}
