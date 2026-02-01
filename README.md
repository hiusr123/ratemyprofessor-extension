# RateMyProfessor Context Extension

![Vibe Coding](https://img.shields.io/badge/Vibe-Coding-ff69b4)
![Gemini 3 Flash](https://img.shields.io/badge/Model-Gemini%203%20Flash-8E75B2)
![Claude Sonnet 4.5](https://img.shields.io/badge/Model-Claude%20Sonnet%204.5-D97757)

> **Built with the power of Gemini 3 Flash & Claude Sonnet 4.5 in Antigravity**

A high-performance Chrome/Firefox extension that integrates RateMyProfessor (RMP) intelligence directly into school course registration websites using a **dynamic floating tooltip**.

## ✨ Features

### 🎯 Smart Selection-Based UI
- **Floating Tooltip**: Highlight any professor's name to see their RMP rating instantly in a sleek, dark-mode tooltip
- **Shadow DOM Isolation**: Styles are completely isolated from the host page, preventing CSS conflicts
- **Precise Positioning**: Tooltip appears directly above the selected text using `getBoundingClientRect()`

### 🧠 Intelligent Context Detection
- **Auto-Detect School**: Scans `document.title`, meta tags, headers, and footers to identify the university
- **Department Context**: Extracts department and course information from nearby DOM elements (e.g., "Department: Computer Science", "CS 101")
- **Manual Override**: If auto-detection fails, a clean input field allows you to manually enter the school name
- **Persistent Preferences**: School selections are saved to `chrome.storage.local` per domain

### 🔍 Advanced Search Waterfall
1. **Tier 1 - Exact Match**: Search by full name + school ID
2. **Tier 2 - Department Filter**: Search by last name, filter by department context, boost matching departments
3. **Tier 3 - Fuzzy Matching**: Handle nicknames (e.g., "Liz" → "Elizabeth") using Jaro-Winkler similarity
4. **Global Fallback**: If school detection fails or professor isn't found at the detected school, automatically search RMP globally

### 🎨 Modern UI States
- **Loading**: Animated spinner with "Searching RMP..."
- **Result**: Rating badge (color-coded), department, school, "Would Take Again %", difficulty
- **Manual School Input**: Elegant search input with auto-save
- **Error**: Helpful error messages with fallback search links

## 🚀 Installation

### Chrome (Unpacked)
1. Clone this repository
2. Open `chrome://extensions/`
3. Enable **"Developer mode"** (top right)
4. Click **"Load unpacked"**
5. Select the folder containing `manifest.json`

### Firefox (Temporary)
1. Open `about:debugging#/runtime/this-firefox`
2. Click **"Load Temporary Add-on"**
3. Select `manifest.json`

*Note: Temporary add-ons are removed when Firefox restarts*

### Firefox (Permanent / Signed)
1. Zip the extension folder
2. Go to [Firefox Add-on Developer Hub](https://addons.mozilla.org/en-US/developers/)
3. Select "Distribute on my own"
4. Upload the zip file for signing
5. Download the signed `.xpi` file
6. Drag and drop the `.xpi` into Firefox

**Developer Edition**: Set `xpinstall.signatures.required` to `false` in `about:config` to load unsigned extensions

### Edge
1. Open `edge://extensions`
2. Enable **"Developer mode"**
3. Click **"Load unpacked"**
4. Select the folder

## 📖 Usage

1. Navigate to your university's course catalog or registration page (e.g., MyPlan, Canvas, Blackboard)
2. **Highlight a professor's name** (e.g., "Stuart Reges")
3. A tooltip will appear above the selection showing:
   - Rating (color-coded: green ≥4, yellow ≥3, red <3)
   - Department and School
   - "Would Take Again" percentage
   - Difficulty rating
   - Link to full RMP profile

### Manual School Override
- If the school isn't detected, the tooltip will show an input field
- Type your school name (e.g., "University of Washington") and press Enter
- The extension will remember this choice for the current domain

### Change School
- Click the **"Edit"** button in any result to manually change the school
- Useful if the auto-detection picked the wrong campus

## 🏗️ Architecture

### Files Structure
```
├── manifest.json                 # Extension configuration (Manifest V3)
├── src/
│   ├── background/
│   │   ├── serviceWorker.js      # Search waterfall logic, API calls
│   │   └── background.html       # Service worker loader (Firefox)
│   ├── content/
│   │   └── contentScript.js      # Context detection, tooltip UI, Shadow DOM
│   ├── services/
│   │   └── rmpService.js         # RMP GraphQL API wrapper
│   ├── utils/
│   │   └── stringUtils.js        # Jaro-Winkler, nickname matching
│   └── data/
│       └── departmentMapping.js  # Department normalization (CS → Computer Science)
```

### Key Technologies
- **Manifest V3**: Modern, secure extension architecture
- **Shadow DOM**: Complete style isolation for the tooltip
- **Service Worker**: Background processing for API calls (bypasses CORS)
- **GraphQL**: RateMyProfessor API integration
- **Vanilla JS**: No build step required, clean and hackable

### Search Flow
1. User highlights text → `contentScript.js` captures selection
2. `SchoolScorer` scans page for school name
3. `analyzeContext()` walks DOM tree for department/course context
4. Message sent to `serviceWorker.js` with full context
5. Service worker executes 3-tier search waterfall
6. Results sent back to content script
7. Tooltip renders with Shadow DOM isolation

## 🛠️ Development

### Testing
- Reload the extension after code changes
- Check browser console for `[RMP]` log messages
- Test on various university websites (Canvas, Blackboard, custom portals)

### Debugging
- **Content Script**: Right-click page → Inspect → Console
- **Service Worker**: `chrome://extensions` → Extension details → "Inspect views: service worker"
- **Firefox**: `about:debugging` → Extension → "Inspect"

## 📝 Configuration

### Supported Browsers
- Chrome 88+
- Firefox 109+
- Edge 88+

### Permissions
- `storage`: Save manual school preferences
- `scripting`: Inject content script
- `host_permissions`: Access RateMyProfessor API

## 🤝 Contributing

Feel free to submit issues or pull requests!

## 📄 License

MIT License - See LICENSE file for details
