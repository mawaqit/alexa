import { motion } from "framer-motion";
import { API_BASE } from "../api/client";
import { EASE_OUT, SPRING } from "../animation";
import { BrandPattern } from "../components/BrandPattern";

export function Landing() {
  return (
    <main className="landing">
      <BrandPattern />
      <div className="card landing-card">
        <motion.div
          className="landing-logo-ring"
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={SPRING}
        >
          <img src="/mawaqit-icon.png" alt="MAWAQIT" className="landing-logo" />
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: EASE_OUT, delay: 0.12 }}
        >
          MAWAQIT for Alexa
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: EASE_OUT, delay: 0.2 }}
        >
          Sign in with Amazon, then pick your mosque and choose which prayers trigger
          the Azan on your Alexa devices. No voice commands required.
        </motion.p>
        {/* Plain link, not a client-side LWA SDK call: the token exchange
            happens server-side in webAuthHandler.js, so the client secret
            never has to reach the browser. */}
        <motion.a
          className="button button-primary"
          href={`${API_BASE}/auth/start`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: EASE_OUT, delay: 0.28 }}
          whileTap={{ scale: 0.96 }}
        >
          Login with Amazon
        </motion.a>
      </div>
    </main>
  );
}
