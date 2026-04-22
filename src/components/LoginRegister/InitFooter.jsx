import styles from "./LoginRegister.module.css";

export default function InitFooter() {
  return (
    <footer className={styles.footerExpanded}>
      <div className={styles.footerContainer}>
        <div className={styles.logoGroupFooter}>
          <div className={styles.logoBox}>SC</div>
          <strong className={styles.logoText}>Sports Centre Booking System</strong>
        </div>
        <span className={styles.copyrightText}>© 2026</span>
      </div>
    </footer>
  );
}
