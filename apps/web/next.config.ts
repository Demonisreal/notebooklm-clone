import { join } from 'node:path';
import type { NextConfig } from 'next';

const config: NextConfig = {
	transpilePackages: ['shared'],
	poweredByHeader: false,
	images: { unoptimized: true },
	output: 'standalone',
	outputFileTracingRoot: join(import.meta.dirname, '../..')
};

export default config;
