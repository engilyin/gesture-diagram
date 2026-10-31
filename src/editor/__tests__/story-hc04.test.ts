import { enforceConnectorInvariants } from "../connectorGraph";
import { createContainer, createLine, createRectangle } from "../shapes";

describe("STORY-HC04 collapsed container connector routing", () => {
  it("reroutes connectors to a collapsed container boundary", () => {
    const container = { ...createContainer(120, 80, 320, 220), id: "container-1" };
    const child = {
      ...createRectangle(180, 140, 120, 80),
      id: "child-1",
      parentId: "container-1",
    };
    const peer = { ...createRectangle(560, 170, 120, 80), id: "peer-1" };
    const connector = {
      ...createLine(0, 0, 100, 20),
      id: "line-1",
      connector: {
        fromId: "child-1",
        toId: "peer-1",
      },
    };

    const expandedRoute = enforceConnectorInvariants([
      { ...container, collapsed: false },
      child,
      peer,
      connector,
    ]).repairedElements.find((element) => element.id === "line-1");
    const collapsedRoute = enforceConnectorInvariants([
      { ...container, collapsed: true },
      child,
      peer,
      connector,
    ]).repairedElements.find((element) => element.id === "line-1");

    expect(expandedRoute).toBeTruthy();
    expect(collapsedRoute).toBeTruthy();
    if (!expandedRoute || !collapsedRoute) {
      return;
    }

    expect(collapsedRoute.x).not.toBe(expandedRoute.x);
    expect(collapsedRoute.y).not.toBe(expandedRoute.y);
    expect(collapsedRoute.x).toBeGreaterThanOrEqual(container.x);
    expect(collapsedRoute.x).toBeLessThanOrEqual(container.x + container.width);
    expect(collapsedRoute.y).toBeGreaterThanOrEqual(container.y);
    expect(collapsedRoute.y).toBeLessThanOrEqual(container.y + container.height);
  });
});
