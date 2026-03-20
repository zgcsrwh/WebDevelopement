import React, { useState, useEffect } from 'react';
import FirestoreFunc from '../provider/FirebaseFunc';

const Todo = () => {
  const [todos, setTodos] = useState([]);
  const [createTodo, setCreateTodo] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  
  // 编辑相关的状态
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState({ id: '', task: '' });
  
  const [loading, setLoading] = useState(true);

  // 1. 获取数据
  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await FirestoreFunc.filter('tasks', [], 'createdAt', 'asc');
        setTodos(data);
      } catch (err) {
        console.error("Fetch error:", err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // 2. 添加数据
  const submitTodo = async (e) => {
    e.preventDefault();
    if (!createTodo.trim()) return;
    const newData = { task: createTodo, isChecked: false };
    try {
      const result = await FirestoreFunc.create('tasks', newData);
      setTodos(prev => [...prev, { ...newData, id: result.id, createdAt: { seconds: Date.now() / 1000 } }]);
      setCreateTodo("");
      setIsAddModalOpen(false);
    } catch (err) { alert("Add failed"); }
  };

  // 3. 删除数据
  const deleteTodo = async (id) => {
    if (!window.confirm("Delete this task?")) return;
    try {
      await FirestoreFunc.remove("tasks", id);
      setTodos(prev => prev.filter(t => t.id !== id));
    } catch (err) { console.error("Delete error:", err); }
  };

  // 4. 打开编辑窗口
  const openEditModal = (todo) => {
    setEditingTodo({ id: todo.id, task: todo.task });
    setIsEditModalOpen(true);
  };

  // 5. 提交修改 (Update)
  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      // 调用通用的 update 接口
      await FirestoreFunc.update('tasks', editingTodo.id, { task: editingTodo.task });
      
      // 同步更新本地 State，避免刷新页面
      setTodos(prev => prev.map(item => 
        item.id === editingTodo.id ? { ...item, task: editingTodo.task } : item
      ));
      
      setIsEditModalOpen(false);
    } catch (err) {
      console.error("Update error:", err);
      alert("Update failed");
    }
  };

  if (loading) return <div style={{textAlign:'center', padding:'20px'}}>Loading tasks...</div>;

  return (
    <div style={pageWrapper}>
      <div style={headerAction}>
        <h2>Task Dashboard</h2>
        <button style={addBtn} onClick={() => setIsAddModalOpen(true)}>+ Add New Task</button>
      </div>

      <div style={todoGrid}>
        {todos.map((todo) => (
          <div key={todo.id} style={todoCard}>
            <div style={todoContent}>
              <span style={taskText}>{todo.task}</span>
              <small style={timeText}>
                {todo.createdAt?.seconds ? new Date(todo.createdAt.seconds * 1000).toLocaleString() : 'Just now'}
              </small>
            </div>
            <div style={actionArea}>
              {/* 编辑按钮 */}
              <button style={editBtn} onClick={() => openEditModal(todo)}>Edit</button>
              <button style={deleteBtn} onClick={() => deleteTodo(todo.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      {/* --- Add Modal --- */}
      {isAddModalOpen && (
        <div style={modalOverlay}>
          <div style={modalContent}>
            <h3>Create New Task</h3>
            <form onSubmit={submitTodo}>
              <input 
                autoFocus
                style={inputStyle}
                value={createTodo}
                onChange={(e) => setCreateTodo(e.target.value)}
                placeholder="What needs to be done?"
              />
              <div style={modalActions}>
                <button type="button" style={cancelBtn} onClick={() => setIsAddModalOpen(false)}>Cancel</button>
                <button type="submit" style={confirmBtn}>Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- Edit Modal --- */}
      {isEditModalOpen && (
        <div style={modalOverlay}>
          <div style={modalContent}>
            <h3>Edit Task</h3>
            <form onSubmit={handleUpdate}>
              <input 
                autoFocus
                style={inputStyle}
                value={editingTodo.task}
                onChange={(e) => setEditingTodo({ ...editingTodo, task: e.target.value })}
                placeholder="Update task description"
              />
              <div style={modalActions}>
                <button type="button" style={cancelBtn} onClick={() => setIsEditModalOpen(false)}>Cancel</button>
                <button type="submit" style={{...confirmBtn, background: '#28a745'}}>Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// --- 追加样式 ---
const pageWrapper = { maxWidth: '800px', margin: '0 auto', padding: '20px' };
const headerAction = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' };
const addBtn = { padding: '10px 20px', background: '#007bff', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' };
const todoGrid = { display: 'grid', gap: '15px' };
const todoCard = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', border: '1px solid #eee', borderRadius: '8px', background: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' };
const todoContent = { display: 'flex', flexDirection: 'column' };
const taskText = { fontSize: '1.1rem', fontWeight: '500' };
const timeText = { color: '#999', fontSize: '0.8rem', marginTop: '4px' };
const actionArea = { display: 'flex', gap: '10px' };
const editBtn = { padding: '6px 12px', background: '#ffc107', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer' };
const deleteBtn = { padding: '6px 12px', background: '#ff4d4f', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' };

const modalOverlay = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 };
const modalContent = { background: '#fff', padding: '30px', borderRadius: '12px', width: '90%', maxWidth: '400px' };
const inputStyle = { width: '100%', padding: '10px', marginBottom: '20px', border: '1px solid #ddd', borderRadius: '4px' };
const modalActions = { display: 'flex', justifyContent: 'flex-end', gap: '10px' };
const cancelBtn = { padding: '8px 16px', background: '#eee', border: 'none', borderRadius: '4px', cursor: 'pointer' };
const confirmBtn = { padding: '8px 16px', background: '#007bff', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' };

export default Todo;