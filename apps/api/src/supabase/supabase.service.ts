import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
	private readonly url: string;
	private readonly publicUrl: string;
	private readonly publishableKey: string;
	private readonly admin: SupabaseClient;

	constructor(config: ConfigService) {
		this.url = config.getOrThrow<string>('SUPABASE_URL');
		this.publicUrl = config.get<string>('SUPABASE_PUBLIC_URL') ?? this.url;
		this.publishableKey = config.getOrThrow<string>('SUPABASE_PUBLISHABLE_KEY');
		this.admin = createClient(this.url, config.getOrThrow<string>('SUPABASE_SECRET_KEY'), {
			auth: { persistSession: false, autoRefreshToken: false }
		});
	}

	// with the user token rls stays in play, so a controller bug does not leak data outright
	forUser(token: string): SupabaseClient {
		return createClient(this.url, this.publishableKey, {
			auth: { persistSession: false, autoRefreshToken: false },
			global: { headers: { Authorization: `Bearer ${token}` } }
		});
	}

	// only for the ingestion, where no user context is left
	asAdmin(): SupabaseClient {
		return this.admin;
	}

	// signed links are built from the internal base, but they open in the browser
	toPublicUrl(url: string): string {
		return url.startsWith(this.url) ? this.publicUrl + url.slice(this.url.length) : url;
	}
}
