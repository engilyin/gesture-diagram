import {
  useCallback,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { EditorSurface } from "../components/EditorSurface";
import { createDocument } from "../editor/document";
import type { DiagramDocument } from "../editor/types";
import type { GestureDiagramApi, GestureDiagramConfig } from "./types";

type GestureDiagramProps = {
  document?: DiagramDocument;
  config?: GestureDiagramConfig;
  onChange?: (document: DiagramDocument) => void;
};

export const GestureDiagram = forwardRef<
  GestureDiagramApi,
  GestureDiagramProps
>(function GestureDiagram({ document, config, onChange }, ref) {
  const [currentDocument, setCurrentDocument] = useState<DiagramDocument>(
    document ?? createDocument(),
  );

  useEffect(() => {
    if (document) {
      setCurrentDocument(document);
    }
  }, [document]);

  const api = useMemo<GestureDiagramApi>(
    () => ({
      getDocument: () => currentDocument,
      setDocument: (nextDocument: DiagramDocument) => {
        setCurrentDocument(nextDocument);
      },
      clear: () => {
        setCurrentDocument(createDocument());
      },
    }),
    [currentDocument],
  );

  useImperativeHandle(ref, () => api, [api]);

  const handleDocumentChange = useCallback(
    (nextDocument: DiagramDocument) => {
      setCurrentDocument(nextDocument);
      onChange?.(nextDocument);
    },
    [onChange],
  );

  return (
    <EditorSurface
      document={currentDocument}
      readOnly={Boolean(config?.readOnly)}
      profileId={config?.profileId}
      onDocumentChange={handleDocumentChange}
    />
  );
});
