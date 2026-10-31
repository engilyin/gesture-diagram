import { fireEvent, render, screen } from "@testing-library/react";
import { DocumentPersistenceControls } from "../DocumentPersistenceControls";

describe("STORY-IE04 draw.io export control", () => {
  it("renders Export draw.io action and calls handler", () => {
    const onExportDrawIo = vi.fn();
    render(
      <DocumentPersistenceControls
        onSave={vi.fn()}
        onLoad={vi.fn()}
        onExportYaml={vi.fn()}
        onExportSvg={vi.fn()}
        onExportPng={vi.fn()}
        onExportPdf={vi.fn()}
        onExportDrawIo={onExportDrawIo}
        onImport={vi.fn(async () => undefined)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Export draw.io" }));
    expect(onExportDrawIo).toHaveBeenCalledTimes(1);
  });
});
