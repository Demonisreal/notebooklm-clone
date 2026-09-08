import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
	title: 'Notebook',
	description: 'Upload sources, chat with them, trace every answer back to its source'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	);
}
