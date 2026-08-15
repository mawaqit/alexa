import { useState } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { getCompleteLinkingUrl, type Mosque } from "../api/client";
import { MosqueSearch } from "./MosqueSearch";
import { ReciterSelector } from "./ReciterSelector";
import { PrayerSelector } from "./PrayerSelector";
import { EASE_OUT, SPRING } from "../animation";

type StepId = "welcome" | "mosque" | "reciter" | "prayers" | "done";

const STEP_ORDER: StepId[] = ["welcome", "mosque", "reciter", "prayers", "done"];
const INDICATOR_STEPS: StepId[] = ["mosque", "reciter", "prayers", "done"];

interface SetupWizardProps {
  initialMosque: Mosque | null;
  initialReciter: string | null;
  initialPrayers: string[];
  timezone: string;
  // True when this browser arrived via the Alexa app's "Link Account" flow
  // — DoneStep prioritizes "Continue to Alexa" over "Go to dashboard" when set.
  linking: boolean;
  onSaveMosque: (mosque: Mosque) => Promise<void>;
  onSaveReciter: (primaryText: string) => Promise<void>;
  onSavePrayers: (prayers: string[]) => Promise<void>;
  onFinish: () => void;
}

const stepVariants: Variants = {
  enter: (direction: number) => ({ opacity: 0, x: direction > 0 ? 32 : -32 }),
  center: { opacity: 1, x: 0, transition: { duration: 0.32, ease: EASE_OUT } },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction > 0 ? -32 : 32,
    transition: { duration: 0.22, ease: EASE_OUT },
  }),
};

export function SetupWizard({
  initialMosque,
  initialReciter,
  initialPrayers,
  timezone,
  linking,
  onSaveMosque,
  onSaveReciter,
  onSavePrayers,
  onFinish,
}: SetupWizardProps) {
  // A mosque already selected (e.g. arriving here mid-setup) means there's
  // nothing to welcome them to or ask again — jump straight to the next
  // undone step.
  const [step, setStep] = useState<StepId>(initialMosque ? "reciter" : "welcome");
  const [direction, setDirection] = useState(1);
  const [selectedMosque, setSelectedMosque] = useState<Mosque | null>(initialMosque);
  const [savingMosque, setSavingMosque] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goTo = (next: StepId) => {
    setDirection(STEP_ORDER.indexOf(next) > STEP_ORDER.indexOf(step) ? 1 : -1);
    setError(null);
    setStep(next);
  };

  const handleMosqueSelect = (mosque: Mosque) => {
    setSavingMosque(true);
    setError(null);
    onSaveMosque(mosque)
      .then(() => {
        setSelectedMosque(mosque);
        goTo("reciter");
      })
      .catch(() => setError("Couldn't save that mosque — please try again."))
      .finally(() => setSavingMosque(false));
  };

  const handleReciterSave = (primaryText: string) =>
    onSaveReciter(primaryText).then(() => goTo("prayers"));

  const handlePrayersSave = (prayers: string[]) =>
    onSavePrayers(prayers).then(() => goTo("done"));

  return (
    <div className="wizard">
      <StepIndicator current={step} />

      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={step}
          custom={direction}
          variants={stepVariants}
          initial="enter"
          animate="center"
          exit="exit"
          className="wizard-step"
        >
          {step === "welcome" && <WelcomeStep onNext={() => goTo("mosque")} />}

          {step === "mosque" && (
            <div className="wizard-step-body">
              <h2>Find your mosque</h2>
              <p className="muted-text">
                Search by name, or let us find mosques near you.
              </p>
              {error && <p className="error-banner">{error}</p>}
              <MosqueSearch onSelect={handleMosqueSelect} disabled={savingMosque} />
            </div>
          )}

          {step === "reciter" && (
            <div className="wizard-step-body">
              <h2>Choose your favorite reciter</h2>
              <p className="muted-text">
                Pick the voice you'd like to hear for the Azan — or skip to use the
                default.
              </p>
              <ReciterSelector
                selected={initialReciter}
                onSave={handleReciterSave}
                onSkip={() => goTo("prayers")}
              />
            </div>
          )}

          {step === "prayers" && selectedMosque && (
            <div className="wizard-step-body">
              <h2>Choose your Azan prayers</h2>
              <p className="muted-text">
                Pick which prayers should trigger the Azan on your Alexa devices.
              </p>
              <PrayerSelector
                mosqueUuid={selectedMosque.uuid}
                timezone={timezone}
                selected={initialPrayers}
                onSave={handlePrayersSave}
              />
            </div>
          )}

          {step === "done" && <DoneStep linking={linking} onFinish={onFinish} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="wizard-step-body wizard-welcome">
      <motion.img
        src="/mawaqit-icon.png"
        alt=""
        className="wizard-logo"
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ ...SPRING, delay: 0.05 }}
      />
      <motion.h2
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: EASE_OUT, delay: 0.15 }}
      >
        Let's set up your Azan
      </motion.h2>
      <motion.p
        className="muted-text"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: EASE_OUT, delay: 0.22 }}
      >
        A few quick steps: pick your mosque, choose your favorite reciter, then
        choose which prayers should trigger the Azan on your Alexa devices.
      </motion.p>
      <motion.button
        type="button"
        className="button button-primary"
        onClick={onNext}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: EASE_OUT, delay: 0.3 }}
        whileTap={{ scale: 0.96 }}
      >
        Get started
      </motion.button>
    </div>
  );
}

function DoneStep({
  linking,
  onFinish,
}: {
  linking: boolean;
  onFinish: () => void;
}) {
  const linkUrl = linking ? getCompleteLinkingUrl() : null;

  return (
    <div className="wizard-step-body wizard-done">
      <motion.div
        className="wizard-checkmark"
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={SPRING}
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <motion.path
            d="M5 13l4 4L19 7"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.4, ease: EASE_OUT, delay: 0.15 }}
          />
        </svg>
      </motion.div>
      <motion.h2
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: EASE_OUT, delay: 0.3 }}
      >
        You're all set
      </motion.h2>
      <motion.p
        className="muted-text"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: EASE_OUT, delay: 0.35 }}
      >
        {linking
          ? "Your mosque and Azan prayers are saved. Continue to finish linking your Alexa skill."
          : "Your mosque and Azan prayers are saved. If your Alexa skill isn't linked yet, " +
            "open the MAWAQIT skill on Alexa and link your account to finish applying it."}
      </motion.p>
      {linkUrl && (
        <motion.a
          href={linkUrl}
          className="button button-primary"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: EASE_OUT, delay: 0.42 }}
          whileTap={{ scale: 0.96 }}
        >
          Continue to Alexa
        </motion.a>
      )}
      <motion.button
        type="button"
        className={linking ? "button button-secondary" : "button button-primary"}
        onClick={onFinish}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: EASE_OUT, delay: linking ? 0.48 : 0.42 }}
        whileTap={{ scale: 0.96 }}
      >
        Go to dashboard
      </motion.button>
    </div>
  );
}

function StepIndicator({ current }: { current: StepId }) {
  const currentIndex = INDICATOR_STEPS.indexOf(current);
  if (currentIndex === -1) return null; // welcome — not a "step" yet

  return (
    <div className="step-indicator" role="progressbar" aria-valuenow={currentIndex + 1} aria-valuemin={1} aria-valuemax={INDICATOR_STEPS.length}>
      {INDICATOR_STEPS.map((s, index) => (
        <motion.span
          key={s}
          className={`step-dot${index <= currentIndex ? " step-dot-active" : ""}`}
          animate={{ scale: index === currentIndex ? 1.2 : 1 }}
          transition={SPRING}
        />
      ))}
    </div>
  );
}
