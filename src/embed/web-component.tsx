import React from "react";
import ReactDOM from "react-dom/client";
import { GestureDiagram } from "./react-wrapper";
import type { DiagramDocument } from "../editor/types";
import type { GestureDiagramConfig } from "./types";

const ELEMENT_NAME = "gesture-diagram";

export class GestureDiagramElement extends HTMLElement {
  private root: ReactDOM.Root | null = null;

  private currentDocument: DiagramDocument | undefined;

  private config: GestureDiagramConfig = {};

  connectedCallback(): void {
    if (!this.root) {
      this.root = ReactDOM.createRoot(this);
    }
    this.renderComponent();
  }

  disconnectedCallback(): void {
    this.root?.unmount();
    this.root = null;
  }

  setDocument(document: DiagramDocument): void {
    this.currentDocument = document;
    this.renderComponent();
  }

  setConfig(config: GestureDiagramConfig): void {
    this.config = config;
    this.renderComponent();
  }

  private renderComponent(): void {
    if (!this.root) {
      return;
    }

    this.root.render(
      <GestureDiagram
        document={this.currentDocument}
        config={this.config}
        onChange={(document) => {
          this.currentDocument = document;
          this.dispatchEvent(
            new CustomEvent("gesture-diagram:change", {
              detail: { document },
            }),
          );
        }}
      />,
    );
  }
}

export function registerGestureDiagramElement(): void {
  if (!customElements.get(ELEMENT_NAME)) {
    customElements.define(ELEMENT_NAME, GestureDiagramElement);
  }
}
