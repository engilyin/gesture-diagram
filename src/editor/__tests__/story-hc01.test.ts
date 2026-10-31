import { createDocument } from "../document";
import {
  autoSizeContainers,
  CONTAINER_PADDING,
  moveGroupedElements,
  reconcileContainerOwnership,
  releaseChildrenFromParents,
} from "../grouping";
import { deserializeDocument, serializeDocument } from "../persistence/yamlCodec";
import { createContainer, createRectangle } from "../shapes";

describe("STORY-HC01 container ownership", () => {
  it("reparents shapes into containers and auto-sizes container bounds", () => {
    const container = { ...createContainer(0, 0, 220, 160), id: "container-1" };
    const child = { ...createRectangle(40, 50, 100, 70), id: "child-1" };

    const owned = reconcileContainerOwnership([container, child]);
    const ownedChild = owned.find((element) => element.id === "child-1");
    expect(ownedChild?.parentId).toBe("container-1");

    const resized = autoSizeContainers(owned);
    const resizedContainer = resized.find((element) => element.id === "container-1");

    expect(resizedContainer).toBeTruthy();
    if (!resizedContainer) {
      return;
    }
    expect(resizedContainer.x).toBe(child.x - CONTAINER_PADDING);
    expect(resizedContainer.y).toBe(child.y - CONTAINER_PADDING);
    expect(resizedContainer.width).toBeGreaterThanOrEqual(
      child.width + CONTAINER_PADDING * 2,
    );
    expect(resizedContainer.height).toBeGreaterThanOrEqual(
      child.height + CONTAINER_PADDING * 2,
    );
  });

  it("moves owned children with their container and can release children on container deletion", () => {
    const container = { ...createContainer(20, 20, 260, 220), id: "container-1" };
    const child = {
      ...createRectangle(80, 90, 100, 60),
      id: "child-1",
      parentId: "container-1",
    };
    const sibling = { ...createRectangle(420, 320, 80, 60), id: "shape-2" };

    const moved = moveGroupedElements([container, child, sibling], [container.id], 30, 40);
    const movedContainer = moved.find((element) => element.id === container.id);
    const movedChild = moved.find((element) => element.id === child.id);

    expect(movedContainer?.x).toBe(container.x + 30);
    expect(movedContainer?.y).toBe(container.y + 40);
    expect(movedChild?.x).toBe(child.x + 30);
    expect(movedChild?.y).toBe(child.y + 40);

    const released = releaseChildrenFromParents(
      moved.filter((element) => element.id !== container.id),
      [container.id],
    );
    const releasedChild = released.find((element) => element.id === child.id);
    expect(releasedChild?.parentId).toBeUndefined();
  });

  it("persists parent references in YAML model", () => {
    const document = createDocument();
    document.elements = [
      { ...createContainer(40, 40, 300, 200), id: "container-1" },
      {
        ...createRectangle(100, 110, 120, 80),
        id: "child-1",
        parentId: "container-1",
      },
    ];

    const yaml = serializeDocument(document, "2026-01-01T00:00:00.000Z");
    const parsed = deserializeDocument(yaml);
    const child = parsed.elements.find((element) => element.id === "child-1");
    expect(child?.parentId).toBe("container-1");
  });
});
