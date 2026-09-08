export const studioKinds = ['briefing', 'faq', 'studyguide', 'mindmap', 'audio'] as const;
export type StudioKind = (typeof studioKinds)[number];

export const studioLabels: Record<StudioKind, string> = {
	briefing: 'Briefing',
	faq: 'FAQ',
	studyguide: 'Study guide',
	mindmap: 'Mind map',
	audio: 'Audio'
};

export const audioStatuses = ['pending', 'processing', 'ready', 'error'] as const;
export type AudioStatus = (typeof audioStatuses)[number];

export type AudioOverview = {
	id: string;
	status: AudioStatus;
	script: string | null;
	url: string | null;
	durationSeconds: number | null;
	errorMessage: string | null;
	createdAt: string;
};

export type MindMapNode = {
	label: string;
	children?: MindMapNode[];
};
