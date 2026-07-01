import { inView, animate, stagger } from "motion";

// Standard easing matches design system ease: .25s cubic-bezier(.4,0,.2,1)
const ease: any = [0.4, 0, 0.2, 1];
const duration = 0.6;

// Function to initialize all animations
export function initAnimations() {
  // 1. Entrance animation for the site header (on page load)
  const header = document.querySelector(".site-header");
  if (header) {
    animate(
      header as any,
      { opacity: [0, 1], y: [-10, 0] },
      { duration: 0.5, ease }
    );
  }

  // 2. Scroll cue bounce loop (on page load)
  const mouse = document.querySelector(".mouse");
  if (mouse) {
    animate(
      mouse as any,
      { y: [0, 8, 0] },
      { duration: 1.5, repeat: Infinity, ease: [0.42, 0, 0.58, 1] as any }
    );
  }

  // 3. Reveal animations for standard fade-up, section heads, and CTA bands (with scale-up)
  inView("[data-reveal='fade-up'], .section-head, .cta-band", (element) => {
    if (element.hasAttribute("data-animated")) return;
    element.setAttribute("data-animated", "true");

    const isCta = element.classList.contains("cta-band");
    const keyframes = isCta
      ? { opacity: [0, 1], y: [30, 0], scale: [0.97, 1] }
      : { opacity: [0, 1], y: [30, 0] };

    animate(
      element as any,
      keyframes,
      { duration: isCta ? 0.8 : duration, ease }
    ).then(() => {
      element.classList.add("is-revealed");
    });
  });

  // 4. Reveal animations for left-sliding elements
  inView("[data-reveal-left]", (element) => {
    if (element.hasAttribute("data-animated")) return;
    element.setAttribute("data-animated", "true");

    animate(
      element as any,
      { opacity: [0, 1], x: [-40, 0] },
      { duration, ease }
    ).then(() => {
      element.classList.add("is-revealed");
    });
  });

  // 5. Reveal animations for right-sliding elements
  inView("[data-reveal-right]", (element) => {
    if (element.hasAttribute("data-animated")) return;
    element.setAttribute("data-animated", "true");

    animate(
      element as any,
      { opacity: [0, 1], x: [40, 0] },
      { duration, ease }
    ).then(() => {
      element.classList.add("is-revealed");
    });
  });

  // 6. Sequential alternating reveal for the timeline steps
  inView(".timeline", (element) => {
    if (element.hasAttribute("data-animated")) return;
    element.setAttribute("data-animated", "true");

    const steps = Array.from(element.querySelectorAll(".tl-step")) as HTMLElement[];
    if (steps.length > 0) {
      steps.forEach((step, index) => {
        const xOffset = index % 2 === 0 ? -40 : 40;
        animate(
          step as any,
          { opacity: [0, 1], x: [xOffset, 0] },
          { duration: 0.8, delay: index * 0.15, ease }
        ).then(() => {
          step.classList.add("is-revealed");
        });
      });
    }
  });

  // 7a. Stat cards — slow, staggered slide-up with count-up on completion
  inView(".stats", (element) => {
    if (element.hasAttribute("data-animated")) return;
    element.setAttribute("data-animated", "true");

    const stats = Array.from(element.querySelectorAll(".stat")) as HTMLElement[];
    if (stats.length === 0) return;

    animate(
      stats as any,
      { opacity: [0, 1], y: [45, 0] },          // deeper starting offset for a more dramatic slide
      { duration: 1.1, delay: stagger(0.18), ease: [0.25, 0.1, 0.25, 1] as any }
    ).then(() => {
      stats.forEach((stat) => {
        stat.classList.add("is-revealed");

        // Count-up fires after the card has fully landed
        const numNode = stat.querySelector(".stat__num");
        if (numNode) {
          const text = numNode.textContent || "";
          const match = text.match(/^(\d+)([\+%])?$/);
          if (match) {
            const targetVal = parseInt(match[1], 10);
            const suffix = match[2] || "";
            animate(0, targetVal, {
              duration: 1.4,
              ease: [0.25, 0.1, 0.25, 1] as any,
              onUpdate: (value: number) => {
                numNode.textContent = Math.round(value) + suffix;
              }
            });
          }
        }
      });
    });
  });

  // 7b. Grid cards and testimonial quotes (existing timing kept)
  inView(".grid, .quotes", (element) => {
    if (element.hasAttribute("data-animated")) return;
    element.setAttribute("data-animated", "true");

    const children = Array.from(element.querySelectorAll(".card, .quote")) as HTMLElement[];
    if (children.length > 0) {
      animate(
        children as any,
        { opacity: [0, 1], y: [30, 0] },
        { duration, delay: stagger(0.08), ease }
      ).then(() => {
        children.forEach((child) => {
          child.classList.add("is-revealed");

          // Micro-animation: delayed scale & rotate on the quote mark
          if (child.classList.contains("quote")) {
            const mark = child.querySelector(".quote__mark");
            if (mark) {
              animate(
                mark as any,
                { opacity: [0, 1], scale: [0.5, 1], rotate: [-10, 0] },
                { duration: 0.6, ease }
              );
            }
          }
        });
      });
    }
  });
}
