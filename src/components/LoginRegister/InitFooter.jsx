import React from 'react';
import styles from './LoginRegister.module.css';

const Footer = () => (
  <footer className={styles.footerExpanded}>
    <div className={styles.footerContainer}>
      {/* 第一列：品牌与链接 */}
      <div className={styles.footerBrandCol}>

        <div className={styles.logoGroupFooter}>
          <span className={styles.logoBox}>M</span>
          <span className={styles.logoText}>Median</span>
        </div>
        
        <p className={styles.brandDesc}>
          Providing smart collaboration solutions for modern teams worldwide.
        </p>

        <p className={styles.copyrightText}>
          © 2026 Median Inc. All rights reserved.
        </p>

      </div>

      {/* 第二列：Contact Us (参考你提供的图片排版) */}
      <div className={styles.footerContactCol}>
        <h3 className={styles.contactTitle}>Contact us</h3>
        
        <div className={styles.contactInfoGroup}>
          <p>Tel: +44(0)23 8059 5000</p>
          <p>Fax: +44(0)23 8059 3131</p>
        </div>
      </div>

      {/* 第三列：Address (参考你提供的图片排版) */}
      <div className={styles.footerContactCol}>
        <h3 className={styles.contactTitle}>Location</h3>
        
        <div className={styles.contactAddressGroup}>
          <p>SO17 1BJ</p>
          <p>100, Amber Road, Southampton </p>          
          <p>United Kingdom</p>
        </div>
      </div>

      {/* 第四列：More Information (参考你提供的图片排版) */}
      <div className={styles.footerContactCol}>
        <h3 className={styles.contactTitle}>More Information</h3>
        
        <div className={styles.footerLinks}>
          <a href="#Privacy Policy">Privacy Policy</a>
        </div>

        <div className={styles.footerLinks}>
          <a href="#Privacy Policy">Helping Center</a>
        </div>

      </div>

    </div>
  </footer>
);

export default Footer;