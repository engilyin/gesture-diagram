import { autoSizeContainers } from "../grouping";
import { createContainer, createRectangle } from "../shapes";

describe("STORY-HC03 container auto-layout modes", () => {
  it("repositions children for row/column/grid and reflows when child set changes", () => {
    const container = {
      ...createContainer(200, 120, 300, 240),
      id: "container-1",
      containerLayoutMode: "row" as const,
    };
    const childA = { ...createRectangle(220, 140, 90, 60), id: "child-a", parentId: "container-1" };
    const childB = { ...createRectangle(360, 190, 120, 70), id: "child-b", parentId: "container-1" };

    const rowLayout = autoSizeContainers([container, childA, childB]);
    const rowA = rowLayout.find((element) => element.id === "child-a");
    const rowB = rowLayout.find((element) => element.id === "child-b");
    expect(rowA?.y).toBe(rowB?.y);
    expect((rowA?.x ?? 0) < (rowB?.x ?? 0)).toBe(true);

    const columnContainer = { ...container, containerLayoutMode: "column" as const };
    const columnLayout = autoSizeContainers([columnContainer, childA, childB]);
    const columnA = columnLayout.find((element) => element.id === "child-a");
    const columnB = columnLayout.find((element) => element.id === "child-b");
    expect(columnA?.x).toBe(columnB?.x);
    expect((columnA?.y ?? 0) < (columnB?.y ?? 0)).toBe(true);

    const gridContainer = { ...container, containerLayoutMode: "grid" as const };
    const childC = { ...createRectangle(240, 220, 80, 80), id: "child-c", parentId: "container-1" };
    const gridLayout = autoSizeContainers([gridContainer, childA, childB, childC]);
    const gridA = gridLayout.find((element) => element.id === "child-a");
    const gridB = gridLayout.find((element) => element.id === "child-b");
    const gridC = gridLayout.find((element) => element.id === "child-c");
    expect(new Set([gridA?.x, gridB?.x, gridC?.x]).size).toBeGreaterThan(1);
    expect(new Set([gridA?.y, gridB?.y, gridC?.y]).size).toBeGreaterThan(1);

    const gridAfterRemove = autoSizeContainers([gridContainer, childA, childB]);
    const removedA = gridAfterRemove.find((element) => element.id === "child-a");
    const removedB = gridAfterRemove.find((element) => element.id === "child-b");
    expect(removedA?.y).toBe(removedB?.y);
  });
});
