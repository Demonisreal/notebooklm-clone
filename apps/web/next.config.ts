import { join } from 'node:path';
import type { NextConfig } from 'next';

const config: NextConfig = {
	transpilePackages: ['shared'],
	// standalone zieht nur die wirklich benutzten dateien ins image
	output: 'standalone',
	outputFileTracingRoot: join(import.meta.dirname, '../..')
};

export default config;
