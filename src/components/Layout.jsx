import { Link, Outlet } from 'react-router-dom';

const Layout = () => {
  return (
    <div style={containerStyle}>
      {/* 共同顶部导航栏 */}
      <header style={headerStyle}>
        <div style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>SFC Portal</div>
        <nav style={navStyle}>
          <Link to="/" style={linkStyle}>Default Home</Link>
          <Link to="/Todo List" style={linkStyle}>My Todo List</Link>
        </nav>
      </header>

      {/* 动态内容区域：Outlet 会渲染当前路由匹配的子页面 */}
      <main style={mainStyle}>
        <Outlet />
      </main>

      {/* 共同底部 */}
      <footer style={footerStyle}>
        <p>Sports Facilities Center | University of Southampton Context</p>
        <p>Contact: support@sfc.ac.uk</p>
      </footer>
    </div>
  );
};

// --- 简单样式 ---
const containerStyle = { display: 'flex', flexDirection: 'column', minHeight: '100vh' };
const headerStyle = { display: 'flex', justifyContent: 'space-between', padding: '1rem 2rem', background: '#2c3e50', color: 'white', alignItems: 'center' };
const navStyle = { display: 'flex', gap: '20px' };
const linkStyle = { color: 'white', textDecoration: 'none' };
const mainStyle = { flex: 1, padding: '2rem' };
const footerStyle = { padding: '1rem', background: '#f8f9fa', textAlign: 'center', borderTop: '1px solid #ddd' };

export default Layout;