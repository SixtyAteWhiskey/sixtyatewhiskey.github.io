# Bahtinov Mask STL Generator

A static browser-based Bahtinov mask generator that exports printable STL files. It is designed to run directly from GitHub Pages with no server and no build process.

## Features

- Enter one aperture / clear-opening diameter in millimeters.
- Automatically scales the printed thickness, outer rim, slat pitch, slat width, and circle smoothness from that diameter.
- Shows the calculated printed outside diameter.
- Optional advanced/manual override mode for fine tuning, including the center divider position.
- Live SVG preview.
- Download STL for slicing.
- Download SVG for reference or laser/CNC workflows.
- Runs entirely in the browser.

## How the diameter works

The main input is the clear aperture/opening diameter. The generated part will be larger than that because the app adds an outer rim.

Example: a 100 mm aperture with a 6 mm rim produces a printed outside diameter of 112 mm.

## GitHub Pages setup

1. Create a new GitHub repository.
2. Upload `index.html`, `styles.css`, `script.js`, and `.nojekyll` to the repository root.
3. In GitHub, go to **Settings → Pages**.
4. Under **Build and deployment**, select **Deploy from a branch**.
5. Select your main branch and `/root`, then save.
6. Open the GitHub Pages URL that GitHub gives you.

## Printing notes

- The STL is built from an outer ring, solid slats, and an optional center hub.
- The slats slightly overlap the rim so slicers usually merge them cleanly.
- If your slicer reports non-manifold/overlapping geometry, use the slicer's repair option.
- For thin masks, print slowly and use enough perimeters. PETG, ASA, PLA+, or PC blends are good candidates depending on outdoor/heat exposure.

## Important caveat

This generator makes a practical Bahtinov-style mask, not a fully optical-theory-optimized mask. The automatic values should work for general focusing, but serious astrophotography users may want to experiment with pitch, slat width, and angle for their focal length and camera setup.
