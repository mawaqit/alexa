import { getCompleteLinkingUrl } from "../api/client";

// Shown whenever this browser arrived via the Alexa app's "Link Account"
// flow (session.linking, set from the alexa_link cookie — see
// webAlexaLinkHandler.js) and hasn't handed back to Alexa yet. A plain
// anchor, not a click handler: it needs to be a real navigation, since it
// ends on Amazon's/Alexa's own domain to complete the account-linking
// handshake, not something a fetch() could do.
export function AlexaLinkBanner() {
  const linkUrl = getCompleteLinkingUrl();

  return (
    <div className="alexa-link-banner">
      <p>Almost done — finish linking your Alexa skill to apply this setup.</p>
      {linkUrl ? (
        <a href={linkUrl} className="button button-primary">
          Continue to Alexa
        </a>
      ) : (
        // Session token missing (e.g. cleared, or this tab's storage lost
        // it) despite the SPA otherwise believing it's logged in — a reload
        // re-fetches /auth/session and sorts this out rather than handing
        // Alexa a broken link.
        <span className="button button-primary" aria-disabled="true">
          Reload to continue
        </span>
      )}
    </div>
  );
}
