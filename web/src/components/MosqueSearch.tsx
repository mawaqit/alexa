import { useState, type FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api, type Mosque } from "../api/client";
import { EASE_OUT, listVariants, listItemVariants } from "../animation";

interface MosqueSearchProps {
  onSelect: (mosque: Mosque) => void;
  disabled?: boolean;
}

type Status = "idle" | "loading" | "error";
type SearchedBy = { kind: "location" } | { kind: "name"; word: string } | null;

const PAGE_SIZE = 5;

export function MosqueSearch({ onSelect, disabled }: MosqueSearchProps) {
  const [results, setResults] = useState<Mosque[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [word, setWord] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [searchedBy, setSearchedBy] = useState<SearchedBy>(null);

  const applyResults = (mosques: Mosque[]) => {
    setResults(mosques);
    setVisibleCount(PAGE_SIZE);
    setStatus("idle");
  };

  const searchByLocation = () => {
    if (!navigator.geolocation) {
      setStatus("error");
      return;
    }
    setStatus("loading");
    setSearchedBy({ kind: "location" });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        api
          .searchMosques({
            lat: String(position.coords.latitude),
            lon: String(position.coords.longitude),
          })
          .then(applyResults)
          .catch(() => setStatus("error"));
      },
      () => setStatus("error"),
    );
  };

  const searchByWord = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = word.trim();
    if (!trimmed) return;
    setStatus("loading");
    setSearchedBy({ kind: "name", word: trimmed });
    api
      .searchMosques({ word: trimmed })
      .then(applyResults)
      .catch(() => setStatus("error"));
  };

  const visibleResults = results.slice(0, visibleCount);
  const hasMore = visibleCount < results.length;
  const showNoResults = status === "idle" && searchedBy !== null && results.length === 0;

  return (
    <div className="mosque-search">
      <div className="mosque-search-actions">
        <motion.button
          type="button"
          className="button button-secondary"
          onClick={searchByLocation}
          disabled={disabled}
          whileTap={{ scale: 0.96 }}
          transition={{ duration: 0.15, ease: EASE_OUT }}
        >
          Use my location
        </motion.button>
        <form onSubmit={searchByWord} className="mosque-search-form">
          <input
            type="text"
            value={word}
            onChange={(event) => setWord(event.target.value)}
            placeholder="Search by mosque name"
            disabled={disabled}
          />
          <motion.button
            type="submit"
            className="button button-secondary"
            disabled={disabled}
            whileTap={{ scale: 0.96 }}
            transition={{ duration: 0.15, ease: EASE_OUT }}
          >
            Search
          </motion.button>
        </form>
      </div>

      {status === "loading" && <p className="muted-text">Searching…</p>}
      {status === "error" && (
        <p className="error-banner">Couldn't search right now — please try again.</p>
      )}
      {showNoResults && (
        <p className="empty-state">
          {searchedBy?.kind === "location"
            ? "No mosque found near your location."
            : `No mosque found matching "${searchedBy?.kind === "name" ? searchedBy.word : ""}".`}
        </p>
      )}

      {visibleResults.length > 0 && (
        <motion.ul
          className="mosque-results"
          variants={listVariants}
          initial="hidden"
          animate="visible"
        >
          <AnimatePresence initial={false}>
            {visibleResults.map((mosque) => (
              <motion.li
                key={mosque.uuid}
                className="mosque-result"
                variants={listItemVariants}
                layout
              >
                {mosque.image && (
                  <img src={mosque.image} alt="" className="mosque-thumb" />
                )}
                <div className="mosque-result-info">
                  <strong>{mosque.primaryText}</strong>
                  {mosque.localisation && <p>{mosque.localisation}</p>}
                </div>
                <motion.button
                  type="button"
                  className="button button-primary"
                  onClick={() => onSelect(mosque)}
                  disabled={disabled}
                  whileTap={{ scale: 0.96 }}
                  transition={{ duration: 0.15, ease: EASE_OUT }}
                >
                  Select
                </motion.button>
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
      )}

      {hasMore && (
        <motion.button
          type="button"
          className="button button-text"
          onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
          whileTap={{ scale: 0.96 }}
          transition={{ duration: 0.15, ease: EASE_OUT }}
        >
          Show {Math.min(PAGE_SIZE, results.length - visibleCount)} more
        </motion.button>
      )}
    </div>
  );
}
