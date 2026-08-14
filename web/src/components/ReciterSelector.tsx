import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { api, type Reciter } from "../api/client";
import { Radio } from "./Radio";
import { EASE_OUT, listVariants, listItemVariants } from "../animation";

interface ReciterSelectorProps {
  selected: string | null;
  onSave: (primaryText: string) => Promise<void>;
  // Only the setup wizard passes this — picking a reciter isn't required to
  // finish setup (PlayAdhanIntentHandler already falls back to a default
  // when nothing's been chosen), so the wizard step needs a way past it
  // without staging anything. The dashboard's inline "Change reciter" card
  // has no equivalent — Cancel already closes it without saving.
  onSkip?: () => void;
}

type Status = "loading" | "idle" | "saving" | "error";

export function ReciterSelector({ selected, onSave, onSkip }: ReciterSelectorProps) {
  const [reciters, setReciters] = useState<Reciter[]>([]);
  const [choice, setChoice] = useState<string | null>(selected);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    api
      .getReciters()
      .then((data) => {
        if (cancelled) return;
        setReciters(data);
        setStatus("idle");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setChoice(selected);
  }, [selected]);

  const save = () => {
    if (!choice) return;
    setStatus("saving");
    onSave(choice)
      .then(() => setStatus("idle"))
      .catch(() => setStatus("error"));
  };

  if (status === "loading") {
    return <p className="muted-text">Loading reciters…</p>;
  }

  if (reciters.length === 0) {
    return (
      <p className="error-banner">
        Couldn't load the reciter list — please try again shortly.
      </p>
    );
  }

  return (
    <div className="reciter-selector">
      <motion.ul
        className="reciter-list"
        variants={listVariants}
        initial="hidden"
        animate="visible"
      >
        {reciters.map(({ primaryText }) => (
          <motion.li key={primaryText} className="reciter-item" variants={listItemVariants}>
            <Radio
              name="favourite-reciter"
              checked={choice === primaryText}
              onChange={() => setChoice(primaryText)}
              label={<span className="reciter-name">{primaryText}</span>}
            />
          </motion.li>
        ))}
      </motion.ul>
      <div className="reciter-selector-actions">
        <motion.button
          type="button"
          className="button button-primary"
          onClick={save}
          disabled={status === "saving" || !choice}
          whileTap={{ scale: 0.96 }}
          transition={{ duration: 0.15, ease: EASE_OUT }}
        >
          {status === "saving" ? "Saving…" : "Save reciter"}
        </motion.button>
        {onSkip && (
          <button type="button" className="button button-text" onClick={onSkip}>
            Skip for now
          </button>
        )}
      </div>
      {status === "error" && <p className="error-banner">Couldn't save — please try again.</p>}
    </div>
  );
}
