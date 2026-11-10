# Yutu 1.0.23

## Mobile playback

The original video element remains mounted. The video grid cell sticks below the iOS safe area while the document below it scrolls. Vertical drags on the image are claimed after direction detection and suppress Shaka touchend/click handling. Sliders and control buttons are excluded, so actual seeking continues to work. Horizontal gestures are not interpreted as minimization.

The image scales with finger movement and settles into a 220px draggable dock with Motion mini (the animation engine used by Cult UI), rather than bringing React components into Vue. Reduced motion disables the settling animation. No separate audio element or mute switching is added.

## Personalized Home

Related videos from the last two watched items supply personal signals. Dedicated Spanish podcast, trailer, and rotating Latin artist searches supply variety. Already-watched and duplicate items are excluded. The music section requires an exact artist/VEVO channel allowlist plus verification/VEVO channel signal; title claims such as “official” on a compilation do not qualify. Provider metadata determines these signals; this is not YouTube's proprietary recommendation engine.

A per-user local cache shows the last successful Home while refreshing. Guest and signed-in caches use different keys. Guests migrate existing device history once. Deleting existing app history also removes the corresponding personal signals.

All standard video thumbnails request hq720 with bounded fallbacks through maxres, sd, hq and mq. Successful low-resolution placeholder responses also trigger fallback. User-selected hidden/start/middle/end modes remain respected. Images retain their aspect ratio.

## Optional accounts

Supabase project: Desarollos Fran (`syyealdlapxmpeccaary`). Only `public.yutu_user_state` was added, with owner-only SELECT/INSERT/UPDATE/DELETE policies, foreign key to Auth, explicit authenticated grants, no anon privileges, bounded JSON payload sizes, and RLS enabled. Existing app tables, policies and global Auth settings were not modified. The frontend uses the project's publishable key, not a privileged key.

Without login, profile and last 100 personal recommendation signals remain in localStorage. Uploaded photos are decoded, centered into a 256px JPEG, and saved only when the user saves the profile. Built-in avatar choices store an asset ID. Guest data is separate from each signed-in user's local data. On first account use, guest data seeds an empty account; existing accounts load their own profile/history. Cloud failures retain the device copy and offer retry; connectivity recovery retries sync.

Login and signup use the existing email/password provider. Email confirmation remains enabled. No automatic anonymous Supabase accounts, device fingerprinting, global email template changes, or project Auth redirects were introduced. Cloud history is for recommendations; full legacy history/playlists are not migrated to another service.

Avatars: built-in puppy retained; three new generated photorealistic studio images (astronaut with blue/pink smoke, adult queen in red evening gown, glossy sport motorcycle) optimized to 384px WebP. Generation used the built-in image tool. The images are illustrative, not photographs of identified real people.

## Validation limits

21 Node tests cover gesture ownership, progressive scale, unchanged video/currentTime, navigation, feed diversity/filtering, local persistence, account isolation and offline saves. Edited source lint, stylesheet lint and production webpack build are required. Live Supabase policies/grants were verified read-only; synthetic Auth-user tests were rejected by automatic approval review and were not executed. Live iPhone gesture behavior and real account email confirmation require device/user verification. The external video API is inaccessible from this cloud environment; no streaming-speed guarantee is made.
