import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import ProjectEditor from "./pages/ProjectEditor";
import Settings from "./pages/Settings";
import ExportDock from "./components/ExportDock";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/project/:name" element={<ProjectEditor />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
      <ExportDock />
    </BrowserRouter>
  </React.StrictMode>
);
