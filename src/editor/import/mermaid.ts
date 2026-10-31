import { createFidelityReport, type FidelityReport } from "./fidelity";
import type { DiagramDocument, DiagramElement } from "../types";

type MermaidImportResult = {
  document: DiagramDocument;
  fidelity: FidelityReport;
};

function normalizeNode(raw: string): string {
  return raw
    .trim()
    .replace(/\[.*?\]/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/"/g, "");
}

function parseSequenceParticipants(lines: string[]): string[] {
  const participants: string[] = [];
  lines.forEach((line) => {
    const participantMatch = line.match(/^participant\s+(.+)$/i);
    if (!participantMatch) {
      return;
    }
    const raw = participantMatch[1]?.trim() ?? "";
    if (raw.length === 0) {
      return;
    }
    const aliasMatch = raw.match(/^(.+?)\s+as\s+(.+)$/i);
    const name = (aliasMatch?.[2] ?? aliasMatch?.[1] ?? raw).trim();
    if (name.length > 0 && !participants.includes(name)) {
      participants.push(name);
    }
  });
  return participants;
}

type SequenceMessage = {
  from: string;
  to: string;
  label: string;
};

function parseSequenceMessages(lines: string[]): SequenceMessage[] {
  return lines
    .map((line) => {
      const [head, tail] = line.split(/:(.+)/);
      if (!head || !tail) {
        return null;
      }
      const match = head.match(/^(.*?)\s*(-->>|->>|-->|->|==>|=>)\s*(.*?)$/);
      if (!match) {
        return null;
      }
      const from = match[1]?.trim() ?? "";
      const to = match[3]?.trim() ?? "";
      const label = tail.trim();
      if (!from || !to || !label) {
        return null;
      }
      return { from, to, label };
    })
    .filter((item): item is SequenceMessage => Boolean(item));
}

function importSequenceDiagram(lines: string[]): MermaidImportResult {
  const participants = parseSequenceParticipants(lines);
  const messages = parseSequenceMessages(lines);
  if (messages.length === 0) {
    throw new Error("Mermaid import failed: no supported sequence messages found");
  }

  const orderedActors = [...participants];
  messages.forEach((message) => {
    if (!orderedActors.includes(message.from)) {
      orderedActors.push(message.from);
    }
    if (!orderedActors.includes(message.to)) {
      orderedActors.push(message.to);
    }
  });

  const actorXStart = 140;
  const actorSpacing = 240;
  const actorTopY = 70;
  const actorWidth = 140;
  const actorHeight = 48;
  const messageTopY = 180;
  const messageStep = 88;

  const actorIds = new Map<string, string>();
  const elements: DiagramElement[] = [];

  orderedActors.forEach((actor, index) => {
    const actorId = `mermaid-seq-actor-${index}`;
    actorIds.set(actor, actorId);
    const centerX = actorXStart + index * actorSpacing;
    elements.push({
      id: actorId,
      kind: "rect",
      x: centerX - actorWidth / 2,
      y: actorTopY,
      width: actorWidth,
      height: actorHeight,
      color: "#4f46e5",
      strokeWidth: 2,
    });
    elements.push({
      id: `mermaid-seq-actor-label-${index}`,
      kind: "text",
      x: centerX - actorWidth / 2,
      y: actorTopY + 6,
      width: actorWidth,
      height: actorHeight - 12,
      text: actor,
      color: "#111827",
      strokeWidth: 1,
    });
  });

  messages.forEach((message, index) => {
    const fromIndex = orderedActors.indexOf(message.from);
    const toIndex = orderedActors.indexOf(message.to);
    if (fromIndex < 0 || toIndex < 0) {
      return;
    }
    const y = messageTopY + index * messageStep;
    const fromX = actorXStart + fromIndex * actorSpacing;
    const toX = actorXStart + toIndex * actorSpacing;
    const fromId = actorIds.get(message.from) ?? `mermaid-seq-actor-${fromIndex}`;
    const toId = actorIds.get(message.to) ?? `mermaid-seq-actor-${toIndex}`;

    elements.push({
      id: `mermaid-seq-msg-${index}`,
      kind: "line",
      x: fromX,
      y,
      width: toX - fromX,
      height: 0,
      color: "#111827",
      strokeWidth: 3,
      connector: {
        fromId,
        toId,
      },
    });

    elements.push({
      id: `mermaid-seq-msg-label-${index}`,
      kind: "text",
      x: Math.min(fromX, toX) + Math.abs(toX - fromX) / 2 - 80,
      y: y - 34,
      width: 160,
      height: 28,
      text: message.label,
      color: "#111827",
      strokeWidth: 1,
    });
  });

  return {
    document: {
      version: "0.1.0",
      elements,
    },
    fidelity: createFidelityReport([]),
  };
}

function importFlowchart(lines: string[]): MermaidImportResult {
  const flowLines = lines.filter((line) => !line.startsWith("flowchart"));
  const edges = flowLines
    .map((line) => line.match(/^(.+?)-+>?(.+)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({
      from: normalizeNode(match[1]),
      to: normalizeNode(match[2]),
    }))
    .filter((edge) => edge.from.length > 0 && edge.to.length > 0);

  if (edges.length === 0) {
    throw new Error("Mermaid import failed: no supported edges found");
  }

  const nodes = Array.from(
    new Set(edges.flatMap((edge) => [edge.from, edge.to])),
  );
  const nodeIndex = new Map(nodes.map((node, index) => [node, index]));

  const elements: DiagramElement[] = nodes.map((_, index) => {
    const id = `mermaid-node-${index}`;
    return {
      id,
      kind: "rect",
      x: 80 + index * 220,
      y: 120 + (index % 2) * 120,
      width: 160,
      height: 72,
      color: "#4f46e5",
      strokeWidth: 2,
    };
  });

  for (const edge of edges) {
    const fromIndex = nodeIndex.get(edge.from);
    const toIndex = nodeIndex.get(edge.to);
    if (fromIndex === undefined || toIndex === undefined) {
      continue;
    }

    const fromId = `mermaid-node-${fromIndex}`;
    const toId = `mermaid-node-${toIndex}`;
    const fromElement = elements[fromIndex];
    const toElement = elements[toIndex];

    elements.push({
      id: `mermaid-edge-${fromIndex}-${toIndex}`,
      kind: "line",
      x: fromElement.x + fromElement.width / 2,
      y: fromElement.y + fromElement.height / 2,
      width:
        toElement.x +
        toElement.width / 2 -
        (fromElement.x + fromElement.width / 2),
      height:
        toElement.y +
        toElement.height / 2 -
        (fromElement.y + fromElement.height / 2),
      color: "#111827",
      strokeWidth: 3,
      connector: {
        fromId,
        toId,
      },
    });
  }

  return {
    document: {
      version: "0.1.0",
      elements,
    },
    fidelity: createFidelityReport([]),
  };
}

export function importMermaid(source: string): MermaidImportResult {
  const lines = source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const firstLine = lines[0]?.toLowerCase();
  if (firstLine?.startsWith("sequenceDiagram".toLowerCase())) {
    return importSequenceDiagram(lines.slice(1));
  }
  return importFlowchart(lines);
}
