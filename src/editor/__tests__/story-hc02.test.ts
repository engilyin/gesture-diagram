import { createContainer, createRectangle } from "../shapes";
import { inheritLayerFromParents, reconcileContainerOwnership } from "../grouping";

describe("STORY-HC02 drag-to-reparent model behavior", () => {
  it("reparents when moved into a container and releases when moved outside", () => {
    const container = { ...createContainer(320, 80, 260, 220), id: "container-1", layer: 0 };
    const child = { ...createRectangle(80, 120, 120, 90), id: "shape-1", layer: 1 };

    const movedInside = { ...child, x: 360, y: 140 };
    const reparented = inheritLayerFromParents(
      reconcileContainerOwnership([container, movedInside]),
    );
    const insideChild = reparented.find((element) => element.id === "shape-1");
    expect(insideChild?.parentId).toBe("container-1");
    expect(insideChild?.layer).toBe(0);

    const movedOutside = {
      ...(insideChild ?? movedInside),
      x: 40,
      y: 360,
    };
    const released = inheritLayerFromParents(
      reconcileContainerOwnership([container, movedOutside]),
    );
    const releasedChild = released.find((element) => element.id === "shape-1");
    expect(releasedChild?.parentId).toBeUndefined();
  });
});
