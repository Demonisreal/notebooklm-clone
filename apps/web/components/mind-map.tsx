'use client';

import { Background, ReactFlow, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useMemo } from 'react';
import type { MindMapNode } from 'shared';

const COLUMN_WIDTH = 190;
const ROW_HEIGHT = 46;

export function MindMap({ tree }: { tree: MindMapNode }) {
	const { nodes, edges } = useMemo(() => layout(tree), [tree]);

	return (
		<div className="h-72 overflow-hidden rounded-md border border-[var(--color-line)]">
			<ReactFlow
				nodes={nodes}
				edges={edges}
				fitView
				nodesDraggable={false}
				nodesConnectable={false}
				proOptions={{ hideAttribution: true }}
			>
				<Background gap={16} />
			</ReactFlow>
		</div>
	);
}

// react flow erwartet absolute positionen, also den baum einmal selbst auslegen
function layout(tree: MindMapNode) {
	const nodes: Node[] = [];
	const edges: Edge[] = [];
	let row = 0;

	const walk = (node: MindMapNode, depth: number, parentId?: string): void => {
		const id = `n${nodes.length}`;
		const children = node.children ?? [];

		// blätter bekommen eine eigene zeile, eltern sitzen mittig zu ihren kindern
		const firstRow = row;
		if (children.length === 0) row += 1;

		const placeholder = nodes.length;
		nodes.push({
			id,
			position: { x: depth * COLUMN_WIDTH, y: 0 },
			data: { label: node.label },
			style: {
				fontSize: 12,
				padding: 6,
				borderRadius: 6,
				width: COLUMN_WIDTH - 40,
				border: '1px solid var(--color-line)',
				background: depth === 0 ? 'var(--color-accent)' : 'var(--color-panel)',
				color: depth === 0 ? '#fff' : 'var(--color-fg)'
			}
		});

		if (parentId) edges.push({ id: `${parentId}-${id}`, source: parentId, target: id });

		for (const child of children) walk(child, depth + 1, id);

		const lastRow = children.length === 0 ? firstRow : row - 1;
		nodes[placeholder].position.y = ((firstRow + lastRow) / 2) * ROW_HEIGHT;
	};

	walk(tree, 0);
	return { nodes, edges };
}
