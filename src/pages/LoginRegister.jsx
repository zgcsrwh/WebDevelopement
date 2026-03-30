import React, { useState } from 'react';
import styles from '../components/LoginRegister/LoginRegister.module.css';

// 引入拆分后的组件
import Carousel from '../components/LoginRegister/Carousel';
import LoginForm from '../components/LoginRegister/LoginForm';
import RegisterForm from '../components/LoginRegister/RegisterForm';
import Footer from '../components/LoginRegister/InitFooter';

const LoginRegister = () => {
  const [isLogin, setIsLogin] = useState(true);

  return (
    <div className={styles.pageWrapper}>
      <main className={styles.mainContent}>
        {/* 1. 左侧：自驱动轮播组件 */}
        <Carousel />

        {/* 2. 右侧：认证面板 */}
        <section className={styles.rightPanel}>
          <div className={styles.authCard}>
            <div className={styles.toggleContainer}>
              <button 
                className={`${styles.toggleBtn} ${isLogin ? styles.activeToggle : ''}`} 
                onClick={() => setIsLogin(true)}
              >
                Sign in
              </button>
              
              <button 
                className={`${styles.toggleBtn} ${!isLogin ? styles.activeToggle : ''}`} 
                onClick={() => setIsLogin(false)}
              >
                Register
              </button>
            </div>

            {/* 3. 根据状态渲染登录或注册业务组件 */}
            {isLogin ? <LoginForm /> : <RegisterForm onSwitch={() => setIsLogin(true)}/>}
          </div>
        </section>
      </main>

      {/* 4. 底栏 */}
      <Footer />
    </div>
  );
};

export default LoginRegister;