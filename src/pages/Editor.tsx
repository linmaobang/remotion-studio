import { useParams } from 'react-router-dom';

export default function Editor() {
  const { id } = useParams();
  return <h1>编辑器（占位）：{id}</h1>;
}
