import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ProjectList } from './pages/ProjectList'
import { Editor } from './pages/Editor'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ProjectList />} />
        <Route path="/project/:projectId" element={<Editor />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
