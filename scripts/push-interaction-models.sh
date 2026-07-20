#!/usr/bin/env bash
#
# Push every locale interaction model in interactionModels/ to the skill's
# `development` stage via the ASK CLI (SMAPI).
#
# Prerequisites:
#   - ASK CLI configured with a profile that can edit the MAWAQIT skill
#     (see INTERNAL.md → "Configuring the ASK CLI"). Default profile: MAWAQIT.
#
# Overridable via env vars:
#   SKILL_ID     the target skill id
#   ASK_PROFILE  the ASK CLI profile name
set -euo pipefail

SKILL_ID="${SKILL_ID:-amzn1.ask.skill.81a30fbf-496f-4aa4-a60b-9e35fb513506}"
ASK_PROFILE="${ASK_PROFILE:-MAWAQIT}"
MODELS_DIR="$(cd "$(dirname "$0")/../interactionModels" && pwd)"

echo "Pushing interaction models → skill ${SKILL_ID} (stage: development, profile: ${ASK_PROFILE})"
cd "$MODELS_DIR"
for f in *.json; do
  locale="${f%.json}"
  echo "→ ${locale}"
  ask smapi set-interaction-model \
    --skill-id "$SKILL_ID" \
    --stage development \
    --locale "$locale" \
    --interaction-model "file:${f}" \
    --profile "$ASK_PROFILE"
done
echo "Done. Model builds run asynchronously — check status in the Alexa developer console."
