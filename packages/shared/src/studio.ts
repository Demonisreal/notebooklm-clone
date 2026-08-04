export const studioKinds = ['briefing', 'faq', 'studyguide', 'mindmap'] as const;
export type StudioKind = (typeof studioKinds)[number];

export const studioLabels: Record<StudioKind, string> = {
	briefing: 'Briefing',
	faq: 'Häufige Fragen',
	studyguide: 'Lernhilfe',
	mindmap: 'Mind Map'
};

export type MindMapNode = {
	label: string;
	children?: MindMapNode[];
};
