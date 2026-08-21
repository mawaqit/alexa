import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { WarningCircle } from "@phosphor-icons/react";
import { api, type PrayerTime } from "../api/client";
import { Switch } from "./Switch";
import { EASE_OUT, listVariants, listItemVariants } from "../animation";

interface PrayerSelectorProps {
  mosqueUuid: string;
  timezone: string;
  selected: string[];
  onSave: (prayers: string[]) => Promise<void>;
}

type Status = "loading" | "idle" | "saving" | "error";

export function PrayerSelector({ mosqueUuid, timezone, selected, onSave }: PrayerSelectorProps) {
  const [prayerTimes, setPrayerTimes] = useState<PrayerTime[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set(selected));
  const [status, setStatus] = useState<Status>("loading");

  // Only prayers the mosque actually has a time for today are offered —
  // mirrors the same filter the voice flow applies (see
  // routineEligiblePrayers.js on the backend).
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    api
      .getMosqueTimes(mosqueUuid, timezone)
      .then((data) => {
        if (cancelled) return;
        setPrayerTimes(data.prayerTimes);
        setStatus("idle");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [mosqueUuid, timezone]);

  useEffect(() => {
    setChecked(new Set(selected));
  }, [selected]);

  const toggle = (canonicalName: string) => {
    setChecked((previous) => {
      const next = new Set(previous);
      if (next.has(canonicalName)) {
        next.delete(canonicalName);
      } else {
        next.add(canonicalName);
      }
      return next;
    });
  };

  const save = () => {
    setStatus("saving");
    onSave(Array.from(checked))
      .then(() => setStatus("idle"))
      .catch(() => setStatus("error"));
  };

  if (status === "loading") {
    return <p className="muted-text">Loading prayer times…</p>;
  }

  if (prayerTimes.length === 0) {
    return (
      <p className="error-banner">
        <WarningCircle size={18} weight="fill" aria-hidden="true" />
        Couldn't load this mosque's prayer times. Please try again shortly.
      </p>
    );
  }

  return (
    <div className="prayer-selector">
      <motion.ul
        className="prayer-list"
        variants={listVariants}
        initial="hidden"
        animate="visible"
      >
        {prayerTimes.map(({ canonicalName, time }) => (
          <motion.li key={canonicalName} className="prayer-item" variants={listItemVariants}>
            <Switch
              checked={checked.has(canonicalName)}
              onChange={() => toggle(canonicalName)}
              label={
                <>
                  <span className="prayer-name">{canonicalName}</span>
                  <span className="prayer-time">{time}</span>
                </>
              }
            />
          </motion.li>
        ))}
      </motion.ul>
      <motion.button
        type="button"
        className="button button-primary"
        onClick={save}
        disabled={status === "saving"}
        whileTap={{ scale: 0.96 }}
        transition={{ duration: 0.15, ease: EASE_OUT }}
      >
        {status === "saving" ? "Saving…" : "Save prayer selection"}
      </motion.button>
      {status === "error" && (
        <p className="error-banner">
          <WarningCircle size={18} weight="fill" aria-hidden="true" />
          Couldn't save. Please try again.
        </p>
      )}
    </div>
  );
}
