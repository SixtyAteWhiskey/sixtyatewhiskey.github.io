# Bahtinov Mask STL Generator

A static browser-based Bahtinov mask generator that exports printable STL files. It is designed to run directly from GitHub Pages with no server and no build process.

## Features

- Enter any aperture diameter in millimeters.
- Tune thickness, rim width, slat pitch, slat width, diagonal angle, center section width, and optional central hub.
- Live SVG preview.
- Download STL for slicing.
- Download SVG for reference or laser/CNC workflows.
- Runs entirely in the browser.

## GitHub Pages setup

1. Create a new GitHub repository.
2. Upload `index.html`, `styles.css`, and `script.js` to the repository root.
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

This generator makes a practical Bahtinov-style mask, not a fully optical-theory-optimized mask. The default values should work for general focusing, but serious astrophotography users may want to experiment with pitch, slat width, and angle for their focal length and camera setup.
