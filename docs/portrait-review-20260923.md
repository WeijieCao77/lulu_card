# Portrait review — 2026-09-23

This is a staged completion pass, not a claim that every card has a verified real portrait.

## Baseline

831 cards: 677 ordinary players, 114 coaches, 40 mythics. The independent audit found 124 null faces and 37 real files that were actually generic silhouettes, so 161 cards needed photographs. All 707 referenced files decoded; a decodable file is not proof of identity.

## This release batch

48 previously missing or placeholder photographs were completed: 34 ordinary players and 14 coaches. Pad also received a higher-resolution head-and-shoulders version of the same official photograph. Real-photo coverage rose from 670/831 to 718/831: players 615/677, coaches 63/114, mythics 40/40. Remaining: 113 cards (98 null images and 15 known silhouettes). New files total 786116 bytes.

## Research and acceptance

DeepSeek V4 Pro produced the primary TrackingThePros discovery/downloading script and a second source research proposal. The reviewer fixed input paths, retained real profile metadata, strict HTTPS/size limits, resumable staging, and audited each accepted source and image. It stages files only; it never automatically changes the game database. A second DeepSeek EsportsCharts script was not used after a real request returned HTTP 403. Model suggestions are search leads, never identity evidence.

A parallel DeepSeek-assisted official-coach batch supplied seven individually reviewed club photographs (Vitality, SK Gaming, NAVI, G2, DFM and Vivo Keyd Stars). RapidStar’s candidate was rejected because promotional text obscured the face.

A further DeepSeek-assisted other-region batch inspected 79 profile candidates, found 21 decodable photographs, rejected a wrong Hiro and held a non-solo Potent image. Nineteen passed full-name/career corroboration and visual review; the accepted set prefers official TLN/HLL and stronger individual sources when available.

The accepted photographs and exact source/identity chains are in `portrait-additions-20260923.json`. Remaining card IDs and rejection reasons are in `portrait-remaining-20260923.json`. Historic uniforms and changed career roles do not by themselves imply the person is different; exact full names and corroborated career history are required.

## Rejections worth preserving

- Revenge: US Mohamed Kaddoura is not the unpictured LCK/DSC card.
- Nia: the game's LNG/Korean real-name record conflicts with the IG/Chinese Nia profile. No name-only substitution.
- MG: the game's Romanian real name conflicts with the Korean BFX/tournament identity. No roster fields changed.
- Solid: the RFT page labels Nam Hyeon-seo but links an image named Diego Vallejo. Rejected as identity contamination.
- Tyrion, Eclipse and rcg: identified profile pages still serve generic defaults; these are not completed portraits.
- Guilhoto and Spawn: old TrackingThePros image endpoints returned HTML; replaced with actual GIANTX official and named interview photography respectively.
- Edgar and the initial Daeny candidate: article/Flickr images contained multiple people and were rejected. Daeny was later sourced from an explicitly captioned single-person image in Movistar’s 2025 Worlds guide.

## Mythic sample

GALA's current file is a solo 2021 match photograph. Perkz is the principal person on the right of the 2018 photograph, matching the existing 69% horizontal focal point. Caps is centered near 54% of the MSI 2019 group photograph, matching the existing 54% focal point and 2.25 zoom. These files and mythic mappings were preserved. This sample does not establish that every old photograph has been manually identified.

## Validation

Run `npx tsx scripts/check_portrait_identity_audit.ts` for current coverage/path/hash results. Every newly accepted photograph has also been decoded with Pillow verify/load and visually checked for a single unobstructed person. Source attribution does not establish a commercial reuse license; the provenance file accurately distinguishes official/publicity and profile/interview sources.

All 48 final hashes and Pillow verify/load checks passed. Original player/coach non-image fields, all logos and the entire 40-mythic dossier section were compared against HEAD and are unchanged.

The second official-coach batch added Daeny, Dylan Falco and Melzhet from individually captioned images in Movistar’s 2025 Worlds guide, plus Milan from Vitality. PDF portraits retain native resolution (154–193 pixels wide); they are suitable for small cards and remain candidates for a future higher-resolution upgrade. Pad and Milan use deterministic crops of the original Vitality photographs, with crop coordinates recorded; no facial content was generated or altered.

Mobile-size review: the four oversized Spooder, Toffe, Axelent and bulas source files were proportionally reduced to fit 400×400 and re-encoded as WebP. Each is below 100 KB; provenance hashes, dimensions and runtime cache versions were updated. Composition and facial content were preserved.

The second other-region batch adds Kaboom, Soldier, Riippp, Hiro (French Alexandre El Hodebey/H1RO), Potent, Dawciu and Yeti. Six images are individually named on official 2026 LFL roster pages; Yeti's agency page directly pairs his full name with his photograph. These replace three null mappings and four generic silhouettes. Exact original source hashes, output hashes, identity links and roster/upload context are recorded. Photography dates remain unknown rather than inferred from roster years.

DeepSeek V4 Pro supplied the integration script and a revised implementation. Review caught and corrected path/key handling, alpha preservation, provenance wording and unchanged-field assertions before application. All seven sources matched their staged SHA-256 digests; final WebP files passed Pillow verify/load, runtime card ID/cache-version mapping, and the portrait audit. Compression preserves aspect ratio and alpha, with no crop or enlargement (maximum 400 pixels per side). The final contact sheet was visually reviewed. No player statistics, coach data, logos or mythic mappings were modified by this batch.

Rejected alternatives remain excluded: Vietnamese Hiro is not the French card, the winter Riip image is a game character, and Potent's older ambiguous or multi-person candidates were superseded by the official single-person portrait.
