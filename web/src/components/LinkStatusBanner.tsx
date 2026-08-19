import { CheckCircle, Clock } from "@phosphor-icons/react";
import type { LinkedState } from "../api/client";

interface LinkStatusBannerProps {
  linked: LinkedState;
  deviceLinked?: boolean;
}

export function LinkStatusBanner({ linked, deviceLinked }: LinkStatusBannerProps) {
  if (linked === "alexa") {
    return (
      <p className="status-banner status-ok">
        <CheckCircle size={18} weight="fill" aria-hidden="true" />
        Your Alexa skill is linked. Changes here take effect right away.
      </p>
    );
  }

  if (linked === "web-only") {
    return (
      <p className="status-banner status-pending">
        <Clock size={18} weight="fill" aria-hidden="true" />
        Saved here.{" "}
        {deviceLinked
          ? "Open the MAWAQIT skill on Alexa once more to finish applying it."
          : "Open the MAWAQIT Alexa skill and link your account to finish setup."}
      </p>
    );
  }

  return (
    <p className="status-banner status-pending">
      <Clock size={18} weight="fill" aria-hidden="true" />
      Nothing configured yet. Search for your mosque below to get started.
    </p>
  );
}
