# RateMyProfessor Context Extension

A high-performance Chrome/Firefox extension that integrates RateMyProfessor (RMP) intelligence directly into school course registration websites.

## Features

- **Context Engine**: Automatically detects the university and campus using intelligent scanning of page titles, footers, and meta tags.
- **Instant Ratings**: Highlight a professor's name to see their RMP rating, difficulty, and "Would Take Again" score in a sleek side panel.
- **Smart Search Waterfall**:
    1.  **Exact Match**: Prioritizes exact name matches at the identified school.
    2.  **Department Context**: Uses course codes (e.g., "CS 101") to prioritize professors in the correct department.
    3.  **Fuzzy Fallback**: Handles nicknames (e.g., "Liz" -> "Elizabeth") and typos using the Jaro-Winkler similarity algorithm.
- **Cross-Browser**: Compatible with Manifest V3 for Chrome and Firefox.

## Installation / Development

### Chrome (Unpacked)
1.  Clone this repository.
2.  Open `chrome://extensions/`.
3.  Enable **"Developer mode"** (top right).
4.  Click **"Load unpacked"**.
5.  Select the folder containing `manifest.json`.

*Note: Chrome will keep this extension installed until you remove it or disable Developer Mode.*

### Firefox (Temporary)
1.  Open `about:debugging#/runtime/this-firefox`.
2.  Click **"Load Temporary Add-on"**.
3.  Select `manifest.json`.
*Note: This will disappear when you restart Firefox.*

### Firefox (Permanent / Signed)
To install permanently on Firefox without publishing to the store:
1.  Zip the extension folder (select all files -> Send to -> Compressed (zipped) folder).
2.  Go to [Firefox Add-on Developer Hub](https://addons.mozilla.org/en-US/developers/).
3.  Select "Distribute on my own".
4.  Upload the zip file for signing.
5.  Once signed, download the `.xpi` file.
6.  Drag and drop the `.xpi` file into Firefox to install it permanently.

**Developer Edition Option:**
If you use Firefox Developer Edition, you can toggle `xpinstall.signatures.required` to `false` in `about:config` to load unsigned `.xpi` files permanently.

### Edge
1.  Open `edge://extensions`.
2.  Enable **"Developer mode"**.
3.  Click **"Load unpacked"**.
4.  Select the folder.

## Usage

1.  Navigate to your university's course catalog or registration page.
2.  The extension will attempt to identify the school (look for the "Detecting School..." indicator in the side panel).
3.  Highlight a professor's name (e.g., "David Nixon").
4.  The side panel will open with their RMP details.

## Configuration

### Manual School Override
If the automatic detection gets it wrong, you can manually type your school name (e.g., "Rutgers Newark") in the input box at the top of the side panel. The extension will remember this choice for future searches.

## Architecture

- **Manifest V3**: Secure and performant.
- **Service Worker**: Handles API searching and rigorous logic to bypass CORS.
- **Content Script**: Lightweight DOM scanner for context extraction.
- **Vanilla JS**: No build step required, clean and hackable.
