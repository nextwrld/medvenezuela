import { Routes, Route } from "react-router";
import Home from "./pages/Home";
import Login from "./pages/Login";
import NuevaSolicitud from "./pages/NuevaSolicitud";
import DetalleSolicitud from "./pages/DetalleSolicitud";
import Gestion from "./pages/Gestion";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/solicitar" element={<NuevaSolicitud />} />
      <Route path="/solicitud/:id" element={<DetalleSolicitud />} />
      <Route path="/gestion/:pin?" element={<Gestion />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
