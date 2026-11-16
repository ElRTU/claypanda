import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router";
import Home from "./pages/Home.tsx";
import PiecePage from "./pages/PiecePage.tsx";

// El dashboard se carga aparte: el visitante normal nunca descarga ese código.
const Admin = lazy(() => import("./pages/Admin.tsx"));

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/work/:slug" element={<PiecePage />} />
      <Route
        path="/admin"
        element={
          <Suspense fallback={null}>
            <Admin />
          </Suspense>
        }
      />
      <Route path="*" element={<Home />} />
    </Routes>
  );
}
