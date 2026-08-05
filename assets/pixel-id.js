/* SINGLE SOURCE OF TRUTH for the Meta (Facebook) pixel.
   ====================================================
   Paste the ID from Events Manager -> Data Sources between the quotes. Empty
   string (the default) means NO pixel loads and NO advertising disclosure is
   shown -- the site behaves exactly as it did before this file existed.

   Both surfaces read THIS file:
     - index.html   loads the pixel only when the ID is valid
     - privacy.html reveals the "Advertising" section, and swaps the
                    "no ad trackers" claim, only when the ID is valid

   That coupling is the point. A Meta pixel is an ad tracker, sets a first-party
   _fbp cookie, and does cross-site tracking -- all three of which this site's
   privacy policy explicitly denies. Turning the tracker on without the
   disclosure would make the policy false. Because both read this one value,
   they cannot diverge: there is no way to ship the pixel silently.

   The ID is a 15-16 digit number. Anything else is treated as "off". */
window.HUE_META_PIXEL_ID = '';
