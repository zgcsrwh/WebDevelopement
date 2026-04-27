import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "../components/LoginRegister/LoginRegister.module.css";
import Carousel from "../components/LoginRegister/Carousel";
import LoginForm from "../components/LoginRegister/LoginForm";
import RegisterForm from "../components/LoginRegister/RegisterForm";
import Footer from "../components/LoginRegister/InitFooter";
import { ROUTE_PATHS } from "../constants/routes";

const LoginRegister = ({ initialMode = "login" }) => {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(initialMode !== "register");

  useEffect(() => {
    setIsLogin(initialMode !== "register");
  }, [initialMode]);

  function switchMode(nextIsLogin) {
    setIsLogin(nextIsLogin);
    navigate(nextIsLogin ? ROUTE_PATHS.LOGIN : ROUTE_PATHS.REGISTER, { replace: true });
  }

  return (
    <div className={styles.pageWrapper}>
      <main className={styles.mainContent}>
        <section className={styles.visualPanel}>
          <div className={styles.visualPanelInner}>
            <Carousel />
          </div>
        </section>

        <section className={styles.rightPanel}>
          <div className={styles.rightPanelInner}>
            <div className={styles.authIntro}>
              <h1>Sports Centre Booking System</h1>
            </div>

            <div className={styles.authCard}>
              <div className={styles.toggleContainer}>
                <button
                  className={`${styles.toggleBtn} ${isLogin ? styles.activeToggle : ""}`}
                  onClick={() => switchMode(true)}
                  type="button"
                >
                  Sign in
                </button>

                <button
                  className={`${styles.toggleBtn} ${!isLogin ? styles.activeToggle : ""}`}
                  onClick={() => switchMode(false)}
                  type="button"
                >
                  Register
                </button>
              </div>

              {isLogin ? <LoginForm /> : <RegisterForm onSwitch={() => switchMode(true)} />}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default LoginRegister;
