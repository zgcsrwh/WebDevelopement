// src/components/Home/LoginForm.jsx

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock } from 'lucide-react';
import  { useAuth }  from '../../provider/AuthContext';
import styles from './LoginRegister.module.css';
import googleIcon from '../../images/google_logo.svg';

const LoginForm = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  
  const navigate = useNavigate();
  const { login, loginWithGoogle, loading } = useAuth();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    try {
      // 使用 AuthContext 封装好的 login 方法
      const {userSnap, isMember} = await login(email, password);
      
      console.log(userSnap);
      console.log(isMember);
      if(userSnap.empty){
        setError("null");
      }
      else if(isMember){
        navigate('/home');
      }
      else{ 
        if(userSnap.role === 'admin'){
          navigate('/admin/staff');
        }
        else{
          navigate('/staff/requests');
        }  
      }

    } catch (err) {
      setError(err.message);
    }
  };

  const handleGoogle = async () => {
    try {
      // 使用 AuthContext 封装好的 Google 登录
      await loginWithGoogle();
      navigate('/home');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className={styles.authHeader}>
      <h1 style={{ textAlign: 'left' }}>Welcome</h1>

      {error && <p className={styles.errorMessage}>{error}</p>}

      <form onSubmit={handleLogin}>
        <div className={styles.inputGroup}>
          <label>Email</label>
          <div className={styles.inputWrapper}>
            <Mail className={styles.icon} size={18} />
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com" 
              className={styles.inputField}
              required 
            />
          </div>
        </div>

        <div className={styles.inputGroup}>
          <label>Password</label>
          <div className={styles.inputWrapper}>
            <Lock className={styles.icon} size={18} />
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••" 
              className={styles.inputField}
              required 
            />
          </div>
        </div>

        <button type="submit" className={styles.submitBtn} disabled={loading}>
          {loading ? 'Authentication...' : `Sign in`}
        </button>
      </form>

      <div className={styles.divider}><span>Or</span></div>
      
      <button onClick={handleGoogle} className={styles.externalGoogleBtn} type="button">
        <img src={googleIcon} width="18" alt="G" />
        Sign up/in with Google
      </button>


    </div>
  );
};

export default LoginForm;