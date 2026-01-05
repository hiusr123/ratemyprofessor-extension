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
        // "University of Washington - Bothell" -> "University of Washington Bothell"
        let clean = name.replace(/^(Welcome to |The |Home |Official Site of )/i, '')
            .replace(/[|\-] (Home|Official Page|Login|Portal|Course Catalog|Student System).*$/i, '')
            .trim();

        // REJECTION LOGIC:
        // 1. Must contain "University", "College", "Institute" (unless it's a known short acronym, but let's be strict for now)
        if (!clean.match(/University|College|Institute|Polytechnic|Academy|School/i)) {
            // Allow if source is 'meta-og' (very high trust) AND it doesn't look like a course
            if (source !== 'meta-og') return;
        }

        // 2. Reject obvious Course Titles or Breadcrumbs
        // e.g. "CSS 143 Computer Programming II"
        if (clean.match(/\b\d{3}\b/)) return; // Contains 3 digit number (often course code)
        if (clean.match(/Programming|Introduction|History of|Chemistry of|Physics of/i)) return;

        const current = this.candidates.get(clean) || { weight: 0, sources: [] };
        this.candidates.set(clean, {
            weight: current.weight + weight,
            sources: [...current.sources, source]
        });
    }

    getBestMatch() {
        if (this.candidates.size === 0) return null;

        // Sort by weight
        const sorted = [...this.candidates.entries()].sort((a, b) => b[1].weight - a[1].weight);
        console.log('Context Engine Matches:', sorted);
        return sorted[0][0]; // Return top name
    }

    scan() {
        console.log('Context Engine: Scanning...');
        this.candidates.clear();

        // 1. Meta Tags (High Trust)
        const ogSite = document.querySelector('meta[property="og:site_name"]');
        if (ogSite) this.addCandidate(ogSite.content, 10, 'meta-og');

        const desc = document.querySelector('meta[name="description"]');
        if (desc) {
            // Look for "University of X" in description
            const match = desc.content.match(/((?:[A-Z][a-z]+\s+){1,4}(?:University|College|Institute)(?:\s+of\s+[A-Z][a-z]+)?(?:\s+-[A-Z][a-z]+|\s+[A-Z][a-z]+)?)/);
            if (match) this.addCandidate(match[1], 5, 'meta-desc');
        }

        // 2. Title (Medium Trust)
        let title = document.title;
        if (title) {
            // Split by separators
            const parts = title.split(/[|\-]/);
            // The LAST part is usually the school name in "Course Name | School Name"
            // So we give it higher weight
            if (parts.length > 1) {
                this.addCandidate(parts[parts.length - 1].trim(), 6, 'title-suffix');
                // Check others with lower weight
                for (let i = 0; i < parts.length - 1; i++) {
                    this.addCandidate(parts[i].trim(), 2, 'title-part');
                }
            } else {
                this.addCandidate(title, 4, 'title-full');
            }
        }

        // 3. H1 Tags (Contextual Trust)
        const h1s = document.querySelectorAll('h1');
        h1s.forEach(h1 => {
            const text = h1.innerText.trim();
            // H1 is trustworthy ONLY if it explicitly looks like a University header, not a Page Title
            if (text.length < 60 && text.match(/University|College|Institute/)) {
                this.addCandidate(text, 5, 'h1');
            }
        });

        // 4. Footer / Copyright (High precision for full name)
        const footers = document.querySelectorAll('footer, .footer, #footer, .copyright');
        footers.forEach(el => {
            const text = el.innerText;
            const match = text.match(/(?:©\s*\d{4}\s*)?((?:[A-Z][a-z]+\s+){1,4}(?:University|College|Institute)(?:\s+of\s+[A-Z][a-z]+)?(?:\s+-[A-Z][a-z]+|\s+[A-Z][a-z]+)?)/);
            if (match) this.addCandidate(match[1], 8, 'footer');
        });

        return this.getBestMatch();
    }
}

const scorer = new SchoolScorer();

// Context Extraction
function analyzeContext(node) {
    let department = null;
    let course = null;

    // Helper: Extract Course Code (e.g. CS 101)
    const extractCourse = (text) => {
        // Matches: "CS 101", "CS-101", "COMP SCI 101"
        const match = text.match(/\b([A-Z]{2,8})\s?[-]?\s?(\d{3,4}[A-Z]?)\b/i);
        if (!match) return null;

        const dept = match[1].toUpperCase();
        const code = match[2];

        // Blacklist Bad Departments (Room, Bldg, etc)
        const BLACKLIST = ['ROOM', 'BLDG', 'HALL', 'SEC', 'LAB', 'LEC', 'DISC', 'WEEK', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
        if (BLACKLIST.includes(dept)) return null;

        return { dept, code };
    };

    // 1. Scan immediate siblings/parents
    let element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;

    // Look up to 3 levels
    for (let i = 0; i < 3; i++) {
        if (!element) break;

        // Check text content of this block
        const text = element.innerText.slice(0, 300); // Limit length
        const info = extractCourse(text);
        if (info) {
            department = info.dept;
            course = info.code;
            break;
        }

        // Scan previous sibling (often label "Course: ...")
        let sibling = element.previousElementSibling;
        if (sibling) {
            const infoS = extractCourse(sibling.innerText);
            if (infoS) {
                department = infoS.dept;
                course = infoS.code;
                break;
            }
        }

        element = element.parentElement;
    }

    // 2. Global Backup (H1 or Breadcrumbs) if local failed
    if (!department) {
        // Don't just take ANY h1, ensure it says Department
        const h1 = document.querySelector('h1');
        if (h1 && h1.innerText.includes('Department')) {
            department = h1.innerText.replace(/Department (of)?/i, '').trim();
        }
    }

    return { department, course };
}

// Logic wiring
let debounceTimer = null;
document.addEventListener('selectionchange', () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(handleSelection, 600);
});

async function handleSelection() {
    const selection = window.getSelection();
    const text = selection.toString().trim();
    if (!text || text.length < 3 || text.split(' ').length > 4) return;

    const context = analyzeContext(selection.anchorNode);
    const schoolName = scorer.scan();

    console.log('[RMP] Name:', text, 'School:', schoolName, 'Context:', context);

    chrome.runtime.sendMessage({
        action: 'SEARCH_PROFESSOR',
        payload: {
            name: text,
            schoolDomain: window.location.hostname,
            schoolName: schoolName,
            department: context.department,
            course: context.course
        }
    }, (response) => {
        if (chrome.runtime.lastError) return;
        if (response && response.success) {
            // Handle success
            chrome.storage.local.set({
                currentSearch: {
                    name: text,
                    schoolName: response.schoolName || schoolName,
                    results: response.data,
                    department: context.department // Original context
                }
            });
        } else if (response) {
            // Handle error
            chrome.storage.local.set({
                currentSearch: {
                    name: text,
                    schoolName: schoolName,
                    error: response.error,
                    results: []
                }
            });
        }
    });
}
