import { join } from 'node:path';
import type { NextConfig } from 'next';

const config: NextConfig = {
	transpilePackages: ['shared'],
	// standalone pulls only the files that are actually used into the image
	output: 'standalone',
	outputFileTracingRoot: join(import.meta.dirname, '../..')
};

export default config;
