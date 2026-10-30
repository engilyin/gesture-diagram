import { useId, type ChangeEvent } from "react";

interface DocumentPersistenceControlsProps {
  onSave: () => void;
  onLoad: () => void;
  onExport: () => void;
  onImport: (file: File) => Promise<void>;
}

export function DocumentPersistenceControls({
  onSave,
  onLoad,
  onExport,
  onImport,
}: DocumentPersistenceControlsProps) {
  const fileInputId = useId();

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    await onImport(file);
    event.currentTarget.value = "";
  };

  return (
    <div
      className="document-persistence-controls"
      aria-label="Document persistence controls"
      role="toolbar"
    >
      <button type="button" onClick={onSave}>
        Save
      </button>
      <button type="button" onClick={onLoad}>
        Load
      </button>
      <button type="button" onClick={onExport}>
        Export YAML
      </button>
      <label htmlFor={fileInputId}>
        Import File
        <input
          id={fileInputId}
          type="file"
          accept=".yaml,.yml,.xml,.drawio,.mmd,.mermaid,text/yaml,text/plain,text/xml"
          onChange={handleFileChange}
          style={{ display: "none" }}
        />
      </label>
    </div>
  );
}
