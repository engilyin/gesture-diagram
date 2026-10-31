import { fireEvent, render, screen } from "@testing-library/react";
import { DocumentPersistenceControls } from "../DocumentPersistenceControls";

describe("STORY-IE02 PDF export control", () => {
  it("renders Export PDF action and calls handler", () => {
    const onExportPdf = vi.fn();
    render(
      <DocumentPersistenceControls
        onSave={vi.fn()}
        onLoad={vi.fn()}
        onExportYaml={vi.fn()}
        onExportSvg={vi.fn()}
        onExportPng={vi.fn()}
        onExportPdf={onExportPdf}
        onImport={vi.fn(async () => undefined)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Export PDF" }));
    expect(onExportPdf).toHaveBeenCalledTimes(1);
  });
});
