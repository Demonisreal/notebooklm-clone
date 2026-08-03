import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
	title: 'Notizbuch',
	description: 'Quellen hochladen, mit ihnen chatten, Antworten bis in die Quelle zurückverfolgen'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="de">
			<body>{children}</body>
		</html>
	);
}
