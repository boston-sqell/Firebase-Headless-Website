import { inView, animate, stagger } from "motion";

// Standard easing matches design system ease: .25s cubic-bezier(.4,0,.2,1)
const ease = [0.4, 0, 0.2, 1];
const duration = 0.6;

// Function to initialize all animations
export function initAnimations() {
  inView("[data-reveal='fade-up'], .section-head", (element) => {
    if (element.hasAttribute("data-animated")) return;
    element.setAttribute("data-animated", "true");
    animate(element, { opacity: [0, 1], y: [30, 0] }, { duration, ease }).then(() => {
      element.classList.add("is-revealed");
    });
  });

  inView("[data-reveal-left]", (element) => {
    if (element.hasAttribute("data-animated")) return;
    element.setAttribute("data-animated", "true");
    animate(element, { opacity: [0, 1], x: [-40, 0] }, { duration, ease }).then(() => {
      element.classList.add("is-revealed");
    });
  });

  inView("[data-reveal-right]", (element) => {
    if (element.hasAttribute("data-animated")) return;
    element.setAttribute("data-animated", "true");
    animate(element, { opacity: [0, 1], x: [40, 0] }, { duration, ease }).then(() => {
      element.classList.add("is-revealed");
    });
  });

  inView(".grid, .stats, .quotes", (element) => {
    if (element.hasAttribute("data-animated")) return;
    element.setAttribute("data-animated", "true");
    const children = Array.from(element.querySelectorAll(".card, .stat, .quote")) as HTMLElement[];
    if (children.length > 0) {
      animate(
        children,
        { opacity: [0, 1], y: [30, 0] },
        { duration, delay: stagger(0.08), ease }
      ).then(() => {
        children.forEach(child => child.classList.add("is-revealed"));
      });
    }
  });
}

// The function is exported and will be called by Layout.astro
