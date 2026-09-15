import { cn } from '@/lib/cn';

const LINKS = [
	{ label: 'Legal notice', href: 'https://dmn-software.com/en/impressum.html' },
	{ label: 'Privacy', href: 'https://dmn-software.com/en/datenschutz.html' }
];

// new tab, so a half filled form or an open notebook survives a quick look
export function LegalLinks({ className }: { className?: string }) {
	return (
		<p className={cn('text-xs text-[var(--color-faint)]', className)}>
			{LINKS.map((link, i) => (
				<span key={link.href}>
					{i > 0 && <span className="mx-1.5">·</span>}
					<a
						href={link.href}
						target="_blank"
						rel="noopener noreferrer"
						className="transition hover:text-[var(--color-fg)] hover:underline"
					>
						{link.label}
					</a>
				</span>
			))}
		</p>
	);
}
