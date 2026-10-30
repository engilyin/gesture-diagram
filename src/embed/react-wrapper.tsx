import {
  useCallback,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { EditorSurface } from "../components/EditorSurface";
import { createDocument } from "../editor/document";
import type { DiagramDocument } from "../editor/types";
import type { GestureDiagramApi, GestureDiagramConfig } from "./types";
import {
  createOutgoingEmbedMessage,
  isIncomingEmbedMessage,
} from "./postMessageProtocol";

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

  const currentDocumentRef = useRef(currentDocument);
  useEffect(() => {
    currentDocumentRef.current = currentDocument;
  }, [currentDocument]);

  const postToHost = useCallback(
    (message: ReturnType<typeof createOutgoingEmbedMessage>) => {
      if (!config?.postMessage?.enabled) {
        return;
      }
      const targetOrigin = config.postMessage.targetOrigin ?? "*";
      window.parent.postMessage(message, targetOrigin);
    },
    [config],
  );

  useEffect(() => {
    if (!config?.postMessage?.enabled) {
      return;
    }

    const allowedOrigins = config.postMessage.allowedOrigins;

    const handleMessage = (event: MessageEvent<unknown>) => {
      if (Array.isArray(allowedOrigins) && allowedOrigins.length > 0) {
        if (!allowedOrigins.includes(event.origin)) {
          return;
        }
      }

      if (!isIncomingEmbedMessage(event.data)) {
        return;
      }

      switch (event.data.type) {
        case "ping":
          postToHost(
            createOutgoingEmbedMessage({
              type: "pong",
              requestId: event.data.requestId,
            }),
          );
          return;
        case "get-document":
          postToHost(
            createOutgoingEmbedMessage({
              type: "document",
              requestId: event.data.requestId,
              document: currentDocumentRef.current,
            }),
          );
          return;
        case "set-document":
          currentDocumentRef.current = event.data.document;
          setCurrentDocument(event.data.document);
          postToHost(
            createOutgoingEmbedMessage({
              type: "document",
              requestId: event.data.requestId,
              document: event.data.document,
            }),
          );
          return;
        case "clear": {
          const nextDocument = createDocument();
          currentDocumentRef.current = nextDocument;
          setCurrentDocument(nextDocument);
          postToHost(
            createOutgoingEmbedMessage({
              type: "cleared",
              requestId: event.data.requestId,
            }),
          );
          postToHost(
            createOutgoingEmbedMessage({
              type: "document",
              requestId: event.data.requestId,
              document: nextDocument,
            }),
          );
          return;
        }
      }
    };

    window.addEventListener("message", handleMessage);
    postToHost(createOutgoingEmbedMessage({ type: "ready" }));
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [config, postToHost]);

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
      postToHost(
        createOutgoingEmbedMessage({ type: "change", document: nextDocument }),
      );
    },
    [onChange, postToHost],
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
