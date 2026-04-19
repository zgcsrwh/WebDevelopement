import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import styles from "./LoginRegister.module.css";
import slide1 from "../../images/Slide_1.jpg";
import slide2 from "../../images/Slide_2.jpg";
import slide3 from "../../images/Slide_3.jpg";

const Carousel = () => {
  const slides = [slide1, slide2, slide3];

  const [currentSlide, setCurrentSlide] = useState(0);

  const nextSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev === slides.length - 1 ? 0 : prev + 1));
  }, [slides.length]);

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev === 0 ? slides.length - 1 : prev - 1));
  };

  useEffect(() => {
    const timer = setInterval(nextSlide, 9000);
    return () => clearInterval(timer);
  }, [nextSlide]);

  return (
    <section className={styles.carouselContainer}>
      <img src={slides[currentSlide]} className={styles.slideImage} alt="Sports Centre Booking System" />

      <div className={styles.carouselOverlay}>
        <div className={styles.indicatorContainer}>
          {slides.map((_, index) => (
            <button
              key={index}
              type="button"
              className={`${styles.indicator} ${
                index === currentSlide ? styles.indicatorActive : styles.indicatorInactive
              }`}
              onClick={() => setCurrentSlide(index)}
            />
          ))}
        </div>
      </div>

      <button onClick={prevSlide} className={`${styles.arrowBtn} ${styles.prev}`} type="button">
        <ChevronLeft size={24} />
      </button>
      <button onClick={nextSlide} className={`${styles.arrowBtn} ${styles.next}`} type="button">
        <ChevronRight size={24} />
      </button>
    </section>
  );
};

export default Carousel;
