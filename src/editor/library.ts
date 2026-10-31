import type { DiagramElement } from "./types";

export type LibraryShapeDefinition = {
  id: string;
  name: string;
  category: "Basic Shapes" | "Flowchart";
  kind: Extract<DiagramElement["kind"], "rect" | "ellipse" | "diamond" | "triangle" | "text" | "container">;
  width: number;
  height: number;
};

export const builtInLibraryShapes: LibraryShapeDefinition[] = [
  { id: "basic-rectangle", name: "Rectangle", category: "Basic Shapes", kind: "rect", width: 140, height: 90 },
  { id: "basic-rounded-rectangle", name: "Rounded Rectangle", category: "Basic Shapes", kind: "rect", width: 150, height: 90 },
  { id: "basic-square", name: "Square", category: "Basic Shapes", kind: "rect", width: 100, height: 100 },
  { id: "basic-circle", name: "Circle", category: "Basic Shapes", kind: "ellipse", width: 110, height: 110 },
  { id: "basic-ellipse", name: "Ellipse", category: "Basic Shapes", kind: "ellipse", width: 140, height: 90 },
  { id: "basic-diamond", name: "Diamond", category: "Basic Shapes", kind: "diamond", width: 130, height: 90 },
  { id: "basic-triangle", name: "Triangle", category: "Basic Shapes", kind: "triangle", width: 130, height: 100 },
  { id: "basic-note", name: "Text Note", category: "Basic Shapes", kind: "text", width: 180, height: 90 },
  { id: "basic-title", name: "Title Block", category: "Basic Shapes", kind: "text", width: 260, height: 72 },
  { id: "basic-container", name: "Container", category: "Basic Shapes", kind: "container", width: 280, height: 200 },
  { id: "flow-start", name: "Start / End", category: "Flowchart", kind: "ellipse", width: 150, height: 80 },
  { id: "flow-process", name: "Process", category: "Flowchart", kind: "rect", width: 170, height: 90 },
  { id: "flow-decision", name: "Decision", category: "Flowchart", kind: "diamond", width: 150, height: 100 },
  { id: "flow-data", name: "Data", category: "Flowchart", kind: "rect", width: 180, height: 90 },
  { id: "flow-subprocess", name: "Subprocess", category: "Flowchart", kind: "rect", width: 180, height: 90 },
  { id: "flow-document", name: "Document", category: "Flowchart", kind: "rect", width: 170, height: 100 },
  { id: "flow-database", name: "Database", category: "Flowchart", kind: "ellipse", width: 160, height: 90 },
  { id: "flow-manual-input", name: "Manual Input", category: "Flowchart", kind: "triangle", width: 170, height: 100 },
  { id: "flow-delay", name: "Delay", category: "Flowchart", kind: "ellipse", width: 170, height: 90 },
  { id: "flow-display", name: "Display", category: "Flowchart", kind: "rect", width: 180, height: 90 },
];

export function getBuiltInLibraryCategories(): Array<LibraryShapeDefinition["category"]> {
  return [...new Set(builtInLibraryShapes.map((shape) => shape.category))];
}

export function findLibraryShapeById(shapeId: string): LibraryShapeDefinition | null {
  return builtInLibraryShapes.find((shape) => shape.id === shapeId) ?? null;
}
