/**
 * Context Engine: School Scorer & Discovery
 */
class SchoolScorer {
    constructor() {
        this.candidates = new Map();
    }

    addCandidate(name, weight, source) {
        if (!name || name.length < 4) return;

        // Normalize: Remove common prefixes/suffixes for deduplication
        let clean = name.replace(/^(Welcome to |The |Home |Official Site of )/i, '')
            .replace(/[|\-:\u2013] (Home|Official Page|Login|Portal|Course Catalog|Student System).*$/i, '')
            .trim();

        // Remove domain extensions if accidentally captured (e.g. "canvas.uw.edu")
        clean = clean.replace(/\.(com|edu|org|net)$/i, '');

        // REJECTION LOGIC:
        // Must look like a school name.
        const isEdu = window.location.hostname.endsWith('.edu');
        const hasSchoolKeyword = clean.match(/University|College|Institute|Polytechnic|Academy|School|Seminary/i);

        // If on .edu site, we are more lenient with names
        if (!hasSchoolKeyword && !isEdu) {
            // Allow if explicit source
            if (source !== 'meta-og' && source !== 'manual-override') return;
        }

        // Reject obvious bad patterns
        if (clean.match(/^(Login|Sign In|Dashboard|Courses|Welcome|Home|Index|Search|Help)$/i)) return; // Generic pages
        if (clean.match(/\b\d{3}\b/)) return; // Course codes
        if (clean.match(/Programming|Introduction|History of|Chemistry of|Physics of|Biology of/i)) return; // Course titles

        const current = this.candidates.get(clean) || { weight: 0, sources: [] };
        this.candidates.set(clean, {
            weight: current.weight + weight,
            sources: [...current.sources, source]
        });
    }

    getBestMatch() {
        if (this.candidates.size === 0) return null;

        // Sort by weight desc
        const sorted = [...this.candidates.entries()].sort((a, b) => b[1].weight - a[1].weight);
        console.log('Context Engine Matches:', sorted);
        return sorted[0][0]; // Return top name
    }

    scan() {
        // console.log('Context Engine: Scanning...');
        this.candidates.clear();

        // 1. Meta Tags (High Trust)
        const metas = [
            { query: 'meta[property="og:site_name"]', weight: 12 }, // Facebook OG
            { query: 'meta[name="application-name"]', weight: 10 },
            { query: 'meta[name="apple-mobile-web-app-title"]', weight: 8 },
            { query: 'meta[name="copyright"]', weight: 5 },
            { query: 'meta[name="description"]', weight: 4 },
        ];

        metas.forEach(m => {
            const el = document.querySelector(m.query);
            if (el && el.content) {
                // Special handling for description: extract pattern
                if (m.query.includes('description') || m.query.includes('copyright')) {
                    const match = el.content.match(/((?:[A-Z][a-z]+\s+){1,4}(?:University|College|Institute|State)(?:\s+of\s+[A-Z][a-z]+)?)/);
                    if (match) this.addCandidate(match[1], m.weight, 'meta-regex');
                } else {
                    this.addCandidate(el.content, m.weight, 'meta');
                }
            }
        });

        // 2. Title (Medium Trust - Heavy Parsing)
        // Format often: "Page Title | School Name" or "School Name - Page Title"
        let title = document.title;
        if (title) {
            const parts = title.split(/[|\-:\u2013]/);

            // Assume the part with "University/College" is the school
            parts.forEach(part => {
                const p = part.trim();
                if (p.match(/University|College|Institute|State/)) {
                    this.addCandidate(p, 8, 'title-keyword');
                }
            });

            // Heuristic: The LAST part is often the site name in "Page | Site"
            if (parts.length > 1) {
                this.addCandidate(parts[parts.length - 1].trim(), 4, 'title-suffix');
            } else {
                this.addCandidate(title, 2, 'title-full');
            }
        }

        // 3. Domain Heuristics (e.g. "canvas.uw.edu" -> "University of Washington" mapping would be ideal, 
        // but for now we trust the school name from domain if it's obvious?)
        // TODO: Map domain to school name if offline mapping exists.

        // 4. Header / Footer Analysis
        const h1s = document.querySelectorAll('h1, h2'); // Look at H2s too if H1 is missing context
        h1s.forEach(h => {
            // Only if it looks like a school name
            if (h.innerText.match(/University|College/)) {
                this.addCandidate(h.innerText, 5, 'header');
            }
        });

        const footers = document.querySelectorAll('footer, .footer');
        footers.forEach(f => {
            const match = f.innerText.match(/©\s*\d{4}\s*([A-Za-z\s]+)(?:University|College|Institute)/);
            if (match) this.addCandidate(match[1], 6, 'footer-copyright');
        });

        return this.getBestMatch();
    }
}

const scorer = new SchoolScorer();

// Context Extraction (Improved)
function analyzeContext(node) {
    let department = null;
    let course = null;

    // Helper: Normalize Dept Strings
    const cleanDept = (s) => s.replace(/Department of/i, '').replace(/Department/i, '').trim();

    // 1. Look for course code in the SAME element or immediate parent
    let currentNode = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;

    // First pass: Check the immediate context (same row/element)
    if (currentNode) {
        const immediateText = currentNode.innerText || currentNode.textContent || '';
        const courseMatch = immediateText.match(/\b([A-Z]{2,4})\s?[-]?\s?(\d{3,4})\b/);
        if (courseMatch) {
            course = courseMatch[0]; // Full code "CS 101"
            department = courseMatch[1]; // "CS"
            console.log(`[Context] Found course code: ${course}, dept: ${department}`);
        }
    }

    // 2. Walk up the tree to find department context
    let depth = 0;
    while (currentNode && depth < 8) { // Increased depth for better context

        if (currentNode.innerText) {
            const text = currentNode.innerText;

            // A. Check for explicit "Department: X" or "Department of X"
            if (text.toLowerCase().includes('department')) {
                const match = text.match(/Department\s+(?:of\s+)?([A-Za-z\s&]+)/i);
                if (match && match[1].length < 40) {
                    const deptName = cleanDept(match[1]);
                    // Avoid false positives like "Department Home"
                    if (!deptName.match(/^(Home|Page|Portal|Login|Welcome|Site)$/i)) {
                        department = deptName;
                        console.log(`[Context] Found department label: ${department}`);
                        break;
                    }
                }
            }

            // B. If we haven't found a course code yet, look for it in parent containers
            if (!course) {
                const courseMatch = text.match(/\b([A-Z]{2,4})\s?[-]?\s?(\d{3,4})\b/);
                if (courseMatch) {
                    course = courseMatch[0];
                    if (!department) department = courseMatch[1];
                    console.log(`[Context] Found course in parent: ${course}`);
                }
            }
        }

        // C. Check table headers (TH elements) for department info
        if (currentNode.tagName === 'TABLE') {
            const headers = currentNode.querySelectorAll('th');
            headers.forEach(th => {
                const headerText = th.innerText || '';
                if (headerText.toLowerCase().includes('department')) {
                    const match = headerText.match(/Department\s+(?:of\s+)?([A-Za-z\s&]+)/i);
                    if (match && match[1].length < 40) {
                        department = cleanDept(match[1]);
                    }
                }
            });
        }

        currentNode = currentNode.parentElement;
        depth++;
    }

    // 3. Backup: Global Search for H1/H2 with "Department of X"
    if (!department) {
        const headers = document.querySelectorAll('h1, h2, h3');
        for (const header of headers) {
            if (header.innerText.includes('Department')) {
                const match = header.innerText.match(/Department\s+(?:of\s+)?([A-Za-z\s&]+)/i);
                if (match && match[1].length < 40) {
                    department = cleanDept(match[1]);
                    console.log(`[Context] Found department in header: ${department}`);
                    break;
                }
            }
        }
    }

    console.log(`[Context] Final result - Department: ${department}, Course: ${course}`);
    return { department, course };
}

// --- UI Manager ---
class PopoverManager {
    constructor() {
        this.host = null;
        this.shadow = null;
        this.currentData = null; // Store current search context
    }

    init() {
        if (this.host) return;
        this.host = document.createElement('div');
        this.host.id = 'rmp-popover-host';
        Object.assign(this.host.style, {
            position: 'absolute',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            zIndex: '2147483647',
            pointerEvents: 'none'
        });
        document.body.appendChild(this.host);
        this.shadow = this.host.attachShadow({ mode: 'open' });
        this.injectStyles();
    }

    injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
      :host {
        --bg: #1a1a1a;
        --text: #ffffff;
        --subtext: #a0a0a0;
        --border: rgba(255, 255, 255, 0.1);
        --green: #2ecc71;
        --yellow: #f1c40f;
        --red: #e74c3c;
        --blue: #3498db;
        --font: 'Inter', system-ui, -apple-system, sans-serif;
      }
      .popover {
        position: absolute;
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 16px;
        width: 320px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.5);
        font-family: var(--font);
        color: var(--text);
        pointer-events: auto;
        opacity: 0;
        transform: translateY(8px);
        transition: opacity 0.2s ease, transform 0.2s ease;
        overflow: hidden;
      }
      .popover.visible {
        opacity: 1;
        transform: translateY(0);
      }
      
      /* Headers */
      .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 12px;
      }
      .name {
        font-size: 18px;
        font-weight: 700;
        margin: 0 0 2px 0;
        line-height: 1.2;
      }
      .context {
        font-size: 12px;
        color: var(--subtext);
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .context button {
        background: none;
        border: none;
        color: var(--blue);
        cursor: pointer;
        padding: 0;
        font-size: 11px;
        text-decoration: underline;
      }

      /* Score Badge */
      .badge {
        font-size: 24px;
        font-weight: 800;
        padding: 6px 10px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.08);
        min-width: 40px;
        text-align: center;
      }

      /* Metrics */
      .metrics {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-bottom: 16px;
      }
      .metric {
        background: rgba(255, 255, 255, 0.03);
        padding: 8px;
        border-radius: 6px;
        text-align: center;
      }
      .metric span { display: block; }
      .label { font-size: 10px; color: var(--subtext); text-transform: uppercase; margin-bottom: 4px; }
      .value { font-size: 14px; font-weight: 600; }

      /* Actions */
      .actions {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 12px;
      }
      .btn {
        background: var(--blue);
        color: white;
        text-decoration: none;
        padding: 8px 16px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 600;
        border: none;
        cursor: pointer;
        transition: background 0.2s;
      }
      .btn:hover { background: #2980b9; }
      .btn-text { background: none; color: var(--subtext); padding: 0; font-size: 12px; }
      .btn-text:hover { color: white; }

      /* Loading */
      .loading {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 13px;
        color: var(--subtext);
      }
      .spinner {
        width: 16px;
        height: 16px;
        border: 2px solid rgba(255,255,255,0.1);
        border-top-color: var(--blue);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }

      /* Manual Input */
      .manual-input-container {
        margin-top: 8px;
      }
      .input-group {
        display: flex;
        gap: 8px;
      }
      input {
        flex: 1;
        background: rgba(255,255,255,0.05);
        border: 1px solid var(--border);
        color: white;
        padding: 8px;
        border-radius: 6px;
        font-family: inherit;
        font-size: 13px;
      }
      input:focus { outline: none; border-color: var(--blue); }
    `;
        this.shadow.appendChild(style);
    }

    render(type, data, rect) {
        if (!this.host) this.init();
        this.currentData = data; // Store for callbacks

        const existing = this.shadow.querySelector('.popover');
        if (existing) existing.remove();

        const container = document.createElement('div');
        container.className = 'popover';

        let content = '';

        if (type === 'LOADING') {
            content = `
                <div class="loading">
                    <div class="spinner"></div>
                    Searching RMP...
                </div>
            `;
        } else if (type === 'RESULT') {
            const p = data.result;
            const color = p.avgRating >= 4 ? 'var(--green)' : (p.avgRating >= 3 ? 'var(--yellow)' : 'var(--red)');

            // Logic: If data.schoolName says "Global Search", or matches the generic fallback, use the professor's specific school.
            // Otherwise use the context school.
            let displaySchool = data.schoolName;
            if (p.school && p.school.name && (data.schoolName === 'Global Search' || !data.schoolName)) {
                displaySchool = p.school.name;
            }

            content = `
                <div class="header">
                    <div>
                        <h3 class="name">${p.firstName} ${p.lastName}</h3>
                        <div class="context">
                            ${p.department} • ${displaySchool}
                            <button id="change-school">Edit</button>
                        </div>
                    </div>
                    <div class="badge" style="color: ${color}">${p.avgRating}</div>
                </div>
                <div class="metrics">
                    <div class="metric">
                        <span class="metric-label">Would Take Again</span>
                        <span class="metric-value">${p.wouldTakeAgainPercent >= 0 ? p.wouldTakeAgainPercent + '%' : 'N/A'}</span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">Difficulty</span>
                        <span class="metric-value">${p.avgDifficulty >= 0 ? p.avgDifficulty + ' / 5' : 'N/A'}</span>
                    </div>
                </div>
                <div class="actions">
                    <a href="https://www.ratemyprofessors.com/professor/${p.legacyId}" target="_blank" class="btn">View Profile</a>
                </div>
            `;
        } else if (type === 'MANUAL_SCHOOL') {
            content = `
                <div class="header">
                    <div>
                        <h3 class="name">${data.name}</h3>
                        <div class="context">School not found or incorrect</div>
                    </div>
                </div>
                <div class="manual-input-container">
                    <div class="input-group">
                        <input type="text" id="school-input" placeholder="Enter school name (e.g. Yale)" value="${data.schoolName || ''}">
                        <button id="save-school" class="btn">Search</button>
                    </div>
                </div>
            `;
        } else if (type === 'ERROR') {
            content = `
                <div class="header">
                    <div>
                        <h3 class="name">${data.name}</h3>
                        <div class="context">
                            ${data.schoolName ? data.schoolName : 'Unknown School'}
                            <button id="change-school">Change School</button>
                        </div>
                    </div>
                </div>
                <div style="font-size: 13px; color: var(--subtext); margin-bottom: 12px;">
                    ${data.error || 'No professors found.'}
                </div>
                <div class="actions">
                     <a href="https://www.ratemyprofessors.com/search/professors?q=${encodeURIComponent(data.name)}" target="_blank" class="btn">Search RMP</a>
                </div>
            `;
        }

        container.innerHTML = content;
        this.shadow.appendChild(container);
        this.position(container, rect);

        // Event Listeners
        const changeBtn = container.querySelector('#change-school');
        if (changeBtn) changeBtn.addEventListener('click', () => {
            this.render('MANUAL_SCHOOL', {
                name: data.name,
                searchContext: data.searchContext,
                schoolName: data.schoolName
            }, rect);
        });

        const saveBtn = container.querySelector('#save-school');
        const input = container.querySelector('#school-input');

        if (saveBtn && input) {
            const handleSave = () => {
                const newSchool = input.value.trim();
                if (newSchool) {
                    this.render('LOADING', {}, rect); // Show loading instantly

                    // Send message to background to save preference and re-search
                    chrome.runtime.sendMessage({
                        action: 'MANUAL_SCHOOL_OVERRIDE',
                        payload: {
                            schoolName: newSchool,
                            originalRequest: data.searchContext || {
                                name: data.name,
                                schoolDomain: window.location.hostname,
                                department: null,
                                course: null
                            }
                        }
                    }, (response) => {
                        if (response && response.success && response.data && response.data.length > 0) {
                            // The background should respond with the new result
                            this.render('RESULT', {
                                result: response.data[0],
                                schoolName: response.schoolName,
                                name: data.name,
                                searchContext: data.searchContext
                            }, rect);
                        } else {
                            // Show error or keep input open with error logic?
                            // For now simple error
                            this.render('ERROR', {
                                name: data.name,
                                schoolName: newSchool,
                                error: response?.error || 'Professor not found.',
                                searchContext: data.searchContext
                            }, rect);
                        }
                    });
                }
            };

            saveBtn.addEventListener('click', handleSave);
            input.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSave() });
            input.focus();
        }

        // Close button (if needed, or just outside click)
        // Adding hidden close button logic if strictly required, but outside click usually better

        // Animate
        requestAnimationFrame(() => container.classList.add('visible'));
    }

    position(el, rect) {
        const scrollX = window.scrollX;
        const scrollY = window.scrollY;
        const width = 320; // from css

        let left = rect.left + scrollX + (rect.width / 2) - (width / 2);
        if (left < 10) left = 10;
        if (left + width > document.documentElement.clientWidth - 10) {
            left = document.documentElement.clientWidth - width - 10;
        }

        let top = rect.top + scrollY - 14;

        el.style.left = `${left}px`;
        el.style.top = `${top}px`;
        el.style.transform = `translateY(-100%)`;
    }

    hide() {
        if (!this.shadow) return;
        const el = this.shadow.querySelector('.popover');
        if (el) el.remove();
        this.currentData = null;
    }
}

const ui = new PopoverManager();

// Logic wiring
let debounceTimer = null;

// Close popover on outside click
document.addEventListener('mousedown', (e) => {
    if (ui.host && e.target !== ui.host) {
        ui.hide();
    }
});

document.addEventListener('selectionchange', () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(handleSelection, 800);
});

async function handleSelection() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const text = selection.toString().trim();
    if (!text || text.length < 4 || text.split(' ').length > 3) return;

    // Start UI
    ui.render('LOADING', {}, rect);

    const context = analyzeContext(selection.anchorNode);
    const schoolName = scorer.scan();

    console.log(`[RMP] Searching: ${text} @ ${schoolName}`);

    // Store full context for potential manual override
    const searchContext = {
        name: text,
        schoolDomain: window.location.hostname,
        schoolName: schoolName,
        department: context.department,
        course: context.course
    };

    chrome.runtime.sendMessage({
        action: 'SEARCH_PROFESSOR',
        payload: searchContext
    }, (response) => {
        if (chrome.runtime.lastError) {
            ui.render('ERROR', { name: text, error: 'Connection error' }, rect);
            return;
        }

        if (response && response.success && response.data.length > 0) {
            // Success
            ui.render('RESULT', {
                result: response.data[0],
                schoolName: response.schoolName,
                name: text,
                searchContext: searchContext // Store for "Change School" button
            }, rect);
        } else {
            // Failure or School Missing
            if (!response.schoolName) {
                // School totally unknown -> Prompt user
                ui.render('MANUAL_SCHOOL', {
                    name: text,
                    searchContext: searchContext // Pass full context
                }, rect);
            } else {
                // School known, but prof not found
                ui.render('ERROR', {
                    name: text,
                    schoolName: response.schoolName || schoolName,
                    error: response.error,
                    searchContext: searchContext // Store for "Change School" button
                }, rect);
            }
        }
    });
}
