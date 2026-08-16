import type { Variants } from "framer-motion";

// A smooth decelerate-with-a-touch-of-snap curve — the workhorse easing
// behind most "buttery" UI motion (Vaul/Sonner-style), used everywhere here
// instead of the default linear/ease-in-out.
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

// A gentle overshoot spring for things that should feel physically pressed/
// released (toggle thumbs, step-indicator dots) rather than just faded.
export const SPRING = { type: "spring", stiffness: 420, damping: 32 } as const;

export const fadeUpVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE_OUT } },
};

export const listVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05, delayChildren: 0.02 } },
};

export const listItemVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: EASE_OUT } },
};

// Apple's momentum-projection formula (WWDC 2018 "Designing Fluid
// Interfaces") — projects where a released gesture would coast to a stop,
// so a quick flick can commit to an outcome its velocity implies even if
// the pointer let go before crossing the pixel threshold on its own.
// decelerationRate mirrors iOS scroll deceleration (~0.998 for a normal-
// paced flick); used by SetupWizard's swipe-back gesture.
export function project(velocityPxPerSecond: number, decelerationRate = 0.998): number {
  return ((velocityPxPerSecond / 1000) * decelerationRate) / (1 - decelerationRate);
}
