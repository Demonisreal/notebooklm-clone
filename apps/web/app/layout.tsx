import type { Metadata } from 'next';
import { connection } from 'next/server';
import './globals.css';

export const metadata: Metadata = {
	title: 'Notebook',
	description: 'Upload sources, chat with them, trace every answer back to its source'
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
	// the csp nonce is set per request, a prerendered page would ship scripts without it
	await connection();

	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	);
}
