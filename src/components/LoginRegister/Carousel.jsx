import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import styles from './LoginRegister.module.css';
import slide_1 from '../../images/Slide_1.jpg';
import slide_2 from '../../images/Slide_2.jpg';
import slide_3 from '../../images/Slide_3.jpg';

const Carousel = () => {
  // 1. 内部管理图片数据（也可以作为 Props 传入）
  const slides = [
    {
      url: slide_1,
      title: "State-of-the-Art Facilities",
      desc: "Experience sports like never before with our brand-new equipment and professionally maintained courts designed for peak performance."
    },
    {
      url: slide_2,
      title: "Empowering Local Communities",
      desc: "The perfect venue for club activities and team bookings. We provide the space; you bring the passion and team spirit."
    },
    {
      url: slide_3,
      title: "Connect Through Sports",
      desc: "More than just a game. Join a vibrant community, meet fellow enthusiasts, and find your next favorite workout partner."
    }
  ];

  const [currentSlide, setCurrentSlide] = useState(0);

  // 2. 逻辑函数封装
  const nextSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev === slides.length - 1 ? 0 : prev + 1));
  }, [slides.length]);

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev === 0 ? slides.length - 1 : prev - 1));
  };

  // 3. 自动播放逻辑
  useEffect(() => {
    const timer = setInterval(nextSlide, 10000); // 每 5 秒切换一次
    return () => clearInterval(timer); // 组件卸载时清除定时器
  }, [nextSlide]);

  return (
    <section className={styles.carouselContainer}>
      {/* 图片渲染 */}
      <img 
        src={slides[currentSlide].url} 
        className={styles.slideImage} 
        alt="Hero Slide" 
      />
      
      {/* 文字遮罩层 */}
      <div className={styles.carouselOverlay}>
        <h2>{slides[currentSlide].title}</h2>
        <p>{slides[currentSlide].desc}</p>
        
        {/* 指示条 */}
        <div className={styles.indicatorContainer}>
          {slides.map((_, index) => (
            <div 
              key={index} 
              className={`${styles.indicator} ${
                index === currentSlide ? styles.indicatorActive : styles.indicatorInactive
              }`} 
              onClick={() => setCurrentSlide(index)} // 点击指示条直接跳转
            />
          ))}
        </div>
      </div>

      {/* 左右控制按钮 */}
      <button onClick={prevSlide} className={`${styles.arrowBtn} ${styles.prev}`}>
        <ChevronLeft size={24} />
      </button>
      <button onClick={nextSlide} className={`${styles.arrowBtn} ${styles.next}`}>
        <ChevronRight size={24} />
      </button>
    </section>
  );
};

export default Carousel;