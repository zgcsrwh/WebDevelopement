import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import { Home} from './pages/Home';
import  Todo from './pages/Todo';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} /> 
        <Route path="Todo List" element={<Todo />} />
      </Route>
    </Routes>
  );

}

export default App;