import type { LinkedState } from "../api/client";

interface LinkStatusBannerProps {
  linked: LinkedState;
  deviceLinked?: boolean;
}

export function LinkStatusBanner({ linked, deviceLinked }: LinkStatusBannerProps) {
  if (linked === "alexa") {
    return (
      <p className="status-banner status-ok">
        ✓ Your Alexa skill is linked — changes here take effect right away.
      </p>
    );
  }

  if (linked === "web-only") {
    return (
      <p className="status-banner status-pending">
        Saved here.{" "}
        {deviceLinked
          ? "Open the MAWAQIT skill on Alexa once more to finish applying it."
          : "Open the MAWAQIT Alexa skill and link your account to finish setup."}
      </p>
    );
  }

  return (
    <p className="status-banner status-pending">
      Nothing configured yet — search for your mosque below to get started.
    </p>
  );
}
