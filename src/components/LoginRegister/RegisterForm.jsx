import React, { useState } from 'react';
import styles from './LoginRegister.module.css';
import { User, Mail, Lock, MapPin, Calendar, ShieldCheck, CheckCircle } from 'lucide-react';
import  { useAuth }  from '../../provider/AuthContext';

const RegisterForm = ({ onSwitch }) => {
  const [name, setUserName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [address, setAddress] = useState('')
  const [date_of_birth, setBirthday] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const { signup } = useAuth()

  async function handleRegister(e) {
    e.preventDefault()
    setError('')

    // Verifiy password
    if (password !== confirmPassword) {
      setError('Password does not matched')
      return
    }

    if (password.length < 6) {
      setError('Password should be at least 6 characters.')
      return
    }

    setLoading(true)

    try {
      await signup(name, email, password, address, date_of_birth)
      setSuccess(true)

      alert("Verification email sent. Please check your inbox to verify your account.");
      if (onSwitch) {
        onSwitch(); 
      }

    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes('email-already-in-use')) {
          setError('This email address is already associated with an account.')
        } else if (err.message.includes('invalid-email')) {
          setError('Invalid email format.')
        } else if (err.message.includes('weak-password')) {
          setError('Weak password')
        } else {
          setError(err.message)
        }
      } else {
        setError('Registration failed. Please try again')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.authHeader}>
      <h1>New account</h1>
      <p>Please fill in the following information to complete your registration.</p>

      <form onSubmit={handleRegister} className={styles.verticalForm}>
        <div className={styles.inputGroup}>
          <label>Name</label>
          <div className={styles.inputWrapper}>
            <User className={styles.icon} size={14} />
            <input 
            name="name" 
            placeholder="Your full name" 
            className={styles.inputField} 
            onChange={(e) => setUserName(e.target.value)} required />
            
          </div>
        </div>

        <div className={styles.inputGroup}>
          <label>Email</label>
          <div className={styles.inputWrapper}>
            <Mail className={styles.icon} size={14} />
            <input 
            name="email" 
            type="email" 
            placeholder="example@mail.com" 
            className={styles.inputField} 
            onChange={(e) => setEmail(e.target.value)} required />
          </div>
        </div>

        <div className={styles.inputGroup} lang="en">
          <label>Birthday</label>
          <div className={styles.inputWrapper}>
            <Calendar className={styles.icon} size={14} />
            <input 
            name="date_of_birth" 
            type="date" 
            className={styles.inputField} 
            placeholder="••••••••" 
            onChange={(e) => setBirthday(e.target.value)} />
          </div>
        </div>

        <div className={styles.inputGroup}>
          <label>Address</label>
          <div className={styles.inputWrapper}>
            <MapPin className={styles.icon} size={14} />
            <input 
            name="address" 
            placeholder="Street, City" 
            className={styles.inputField} 
            onChange={(e) => setAddress(e.target.value)} />
          </div>
        </div>

        <div className={styles.inputGroup}>
          <label>Password</label>
          <div className={styles.inputWrapper}>
            <Lock className={styles.icon} size={14} />
            <input 
            name="password" 
            type="password" 
            placeholder="Password should be at least 6 characters." 
            className={styles.inputField} 
            onChange={(e) => setPassword(e.target.value)} 
            required />
          </div>
        </div>

        <div className={styles.inputGroup}>
          <label>Confirmed Password</label>
          <div className={styles.inputWrapper}>
            <CheckCircle className={styles.icon} size={14} />
            <input 
            name="confirmPassword" 
            type="password" 
            onChange={(e) => setConfirmPassword(e.target.value)} 
            required 
            placeholder="Re-enter password" 
            className={styles.inputField} />
          </div>
        </div>

        <button type="submit" className={styles.submitBtn} disabled={loading}>
          {loading ? 'Submitting...' : 'Registration'}
        </button>
      </form>
    </div>
  );
};

export default RegisterForm;