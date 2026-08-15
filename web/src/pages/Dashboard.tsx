import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api, type Mosque, type MeConfigResponse } from "../api/client";
import { AlexaLinkBanner } from "../components/AlexaLinkBanner";
import { LinkStatusBanner } from "../components/LinkStatusBanner";
import { MosqueSearch } from "../components/MosqueSearch";
import { ReciterSelector } from "../components/ReciterSelector";
import { PrayerSelector } from "../components/PrayerSelector";
import { SetupWizard } from "../components/SetupWizard";
import { EASE_OUT, fadeUpVariants } from "../animation";

// Sent with every save so the backend can build EventBridge schedules in the
// right timezone without needing Alexa's Unit Preferences Service (which
// only exists inside a live voice request) — see the plan's timezone note.
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

interface DashboardProps {
  // True when this browser arrived via the Alexa app's "Link Account" flow
  // and hasn't handed back to Alexa yet — see App.tsx/webAlexaLinkHandler.js.
  linking: boolean;
  onLoggedOut: () => void;
}

export function Dashboard({ linking, onLoggedOut }: DashboardProps) {
  const [config, setConfig] = useState<MeConfigResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [changingMosque, setChangingMosque] = useState(false);
  const [savingMosque, setSavingMosque] = useState(false);
  const [changingReciter, setChangingReciter] = useState(false);

  const loadConfig = useCallback(() => {
    return api
      .getConfig()
      .then((data) => {
        setConfig(data);
        setError(null);
      })
      .catch(() => setError("Couldn't load your configuration — please refresh."));
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const saveMosque = (mosque: Mosque) =>
    api
      .saveMosque({ ...mosque, timezone })
      .then(() => loadConfig())
      .then(() => setChangingMosque(false));

  const saveReciter = (primaryText: string) =>
    api
      .saveReciter(primaryText)
      .then(() => loadConfig())
      .catch(() => {
        setError("Couldn't save your reciter selection — please try again.");
        throw new Error("save-reciter-failed");
      });

  const savePrayers = (prayers: string[]) =>
    api
      .savePrayers(prayers, timezone)
      .then(() => loadConfig())
      .catch(() => {
        setError("Couldn't save your prayer selection — please try again.");
        throw new Error("save-prayers-failed");
      });

  const handleChangeMosque = (mosque: Mosque) => {
    setSavingMosque(true);
    saveMosque(mosque)
      .catch(() => setError("Couldn't save that mosque — please try again."))
      .finally(() => setSavingMosque(false));
  };

  const handleLogout = () => {
    api.logout().finally(onLoggedOut);
  };

  if (!config) {
    return (
      <div className="page-loading" role="status">
        Loading…
      </div>
    );
  }

  const routinePrayers = extractCanonicalNames(config.routinePrayers);
  const setupComplete = Boolean(config.mosque) && routinePrayers.length > 0;

  return (
    <main className="dashboard">
      <header className="dashboard-header">
        <img src="/mawaqit-icon.png" alt="" className="header-logo" />
        <h1>MAWAQIT for Alexa</h1>
        <button type="button" className="button button-secondary" onClick={handleLogout}>
          Log out
        </button>
      </header>

      {linking && <AlexaLinkBanner />}

      <LinkStatusBanner linked={config.linked} deviceLinked={config.deviceLinked} />

      {error && <p className="error-banner">{error}</p>}

      <AnimatePresence mode="wait">
        {setupComplete ? (
          <motion.div
            key="summary"
            variants={fadeUpVariants}
            initial="hidden"
            animate="visible"
            className="dashboard-body"
          >
            <section className="card dashboard-section">
              <div className="section-header">
                <h2>Your mosque</h2>
                <button
                  type="button"
                  className="button button-text"
                  onClick={() => setChangingMosque((value) => !value)}
                >
                  {changingMosque ? "Cancel" : "Change mosque"}
                </button>
              </div>

              {config.mosque && !changingMosque && (
                <div className="mosque-card">
                  {config.mosque.image && (
                    <img src={config.mosque.image} alt="" className="mosque-thumb" />
                  )}
                  <div>
                    <strong>{config.mosque.primaryText}</strong>
                    {config.mosque.localisation && <p>{config.mosque.localisation}</p>}
                  </div>
                </div>
              )}

              <AnimatePresence initial={false}>
                {changingMosque && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25, ease: EASE_OUT }}
                    style={{ overflow: "hidden" }}
                  >
                    <MosqueSearch onSelect={handleChangeMosque} disabled={savingMosque} />
                  </motion.div>
                )}
              </AnimatePresence>
            </section>

            <section className="card dashboard-section">
              <div className="section-header">
                <h2>Favorite reciter</h2>
                <button
                  type="button"
                  className="button button-text"
                  onClick={() => setChangingReciter((value) => !value)}
                >
                  {changingReciter
                    ? "Cancel"
                    : config.favouriteAdhaan
                      ? "Change reciter"
                      : "Choose"}
                </button>
              </div>

              {!changingReciter && (
                <p className={config.favouriteAdhaan ? undefined : "muted-text"}>
                  {config.favouriteAdhaan ??
                    "Using the default Azan voice — choose your favorite to personalize it."}
                </p>
              )}

              <AnimatePresence initial={false}>
                {changingReciter && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25, ease: EASE_OUT }}
                    style={{ overflow: "hidden" }}
                  >
                    <ReciterSelector
                      selected={config.favouriteAdhaan}
                      onSave={(primaryText) =>
                        saveReciter(primaryText).then(() => setChangingReciter(false))
                      }
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </section>

            {config.mosque && (
              <section className="card dashboard-section">
                <h2>Azan prayers</h2>
                <PrayerSelector
                  mosqueUuid={config.mosque.uuid}
                  timezone={timezone}
                  selected={routinePrayers}
                  onSave={savePrayers}
                />
              </section>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="wizard"
            variants={fadeUpVariants}
            initial="hidden"
            animate="visible"
            className="card dashboard-section"
          >
            <SetupWizard
              initialMosque={config.mosque}
              initialReciter={config.favouriteAdhaan}
              initialPrayers={routinePrayers}
              timezone={timezone}
              linking={linking}
              onSaveMosque={saveMosque}
              onSaveReciter={saveReciter}
              onSavePrayers={savePrayers}
              onFinish={loadConfig}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

function extractCanonicalNames(routinePrayers: MeConfigResponse["routinePrayers"]): string[] {
  return routinePrayers.map((prayer) =>
    typeof prayer === "string" ? prayer : prayer.canonicalName,
  );
}
