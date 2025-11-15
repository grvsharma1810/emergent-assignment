import type { JSX } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppV2 } from "./AuthV2";
import { Dashboard } from "./Dashboard";

function App(): JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppV2 />} />
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
