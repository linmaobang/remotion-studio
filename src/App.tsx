import { Link, Route, Routes } from 'react-router-dom';
import Home from './pages/Home';
import Editor from './pages/Editor';
import { ThemeToggle } from './theme/ThemeToggle';

export default function App() {
  return (
    <>
      <header className="topbar">
        <Link to="/">Remotion 视频工坊</Link>
        <ThemeToggle />
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/editor/:id" element={<Editor />} />
        </Routes>
      </main>
    </>
  );
}
