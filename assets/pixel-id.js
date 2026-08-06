/* SINGLE SOURCE OF TRUTH for the Meta (Facebook) pixel.
   ====================================================
   Paste the ID from Events Manager -> Data Sources between the quotes. Empty
   string (the default) means NO pixel loads and NO advertising disclosure is
   shown -- the site behaves exactly as it did before this file existed.

   Every surface that makes a tracking claim reads THIS file:
     - index.html   loads the pixel only when the ID is valid, AND swaps its own
                    FAQ answer, which otherwise denies cookies and ad trackers
                    on the very page load that sets _fbp
     - privacy.html reveals the "Advertising" section and swaps the
                    "no ad trackers" and "no sharing" claims

   index.html was MISSING from this list once, and the omission was invisible
   because privacy.html flipped correctly — the page that loads the pixel was
   never the page being checked. If you add a tracking claim anywhere, gate it
   here and add it to this list.

   The JSON-LD FAQ block in index.html deliberately makes NO cookie or tracker
   claim: structured data cannot be gated by script, search engines read the
   served HTML, and a false claim there outlives any later fix.

   That coupling is the point. A Meta pixel is an ad tracker, sets a first-party
   _fbp cookie, and does cross-site tracking -- all three of which this site's
   privacy policy explicitly denies. Turning the tracker on without the
   disclosure would make the policy false. Because both read this one value,
   they cannot diverge: there is no way to ship the pixel silently.

   The ID is a 15-16 digit number. Anything else is treated as "off".

   ⚠️ The pixel ID is NOT the ad account ID. Both are 15-16 digits, so this file
   cannot tell them apart and neither can the regex in index.html — paste the ad
   account id here and the pixel initialises against a dataset that does not
   exist, collecting nothing, silently, while the site's privacy copy flips to
   say it IS tracking. Get the value from Events Manager > Datasets > your
   dataset (NOT the account selector at the top right, which shows the ad
   account). Verify with the Meta Pixel Helper extension before trusting it. */
window.HUE_META_PIXEL_ID = '928398310306386';  /* HueBloom dataset, owned by the Hue business portfolio */
