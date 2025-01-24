import React from "react";
import { Routes, Route } from "react-router-dom";

import Login from "./pages/Login";
import Monitor from "./pages/Monitor";
import Dashboard from "./pages/Dashboard";
import Guide from "./pages/Guide";
import AiInsight from "./pages/AiInsight";

function App() {
  return (
    <Routes>
      {/* "/" - 로그인 화면 */}
      <Route path="/" element={<Login />} />

      {/* "/monitor" - 내 모니터링 화면 */}
      <Route path="/monitor" element={<Monitor />} />

      {/* "/ai-insight" - AI 인사이트 화면 */}
      <Route path="/ai-insight" element={<AiInsight />} />

      {/* "/dashboard" - 통계 분석 화면 */}
      <Route path="/dashboard" element={<Dashboard />} />

      {/* "/guide" - 사용 방법 화면 */}
      <Route path="/guide" element={<Guide />} />
    </Routes>
  );
}

export default App;
