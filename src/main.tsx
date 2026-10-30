import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { registerGestureDiagramElement } from "./embed/web-component";
import "./index.css";

registerGestureDiagramElement();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
