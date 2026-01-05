import rmpService from '../services/rmpService.js';
import { normalizeDepartment } from '../data/departmentMapping.js';
import { scoreProfessor } from '../utils/stringUtils.js';

// Embedded School Data (Mappings)
const schoolsData = {
    "mappings": [
        { "domain": "canvas.instructure.com", "legacyId": "U2Nob29sLTE=" },
        { "domain": "blackboard.com", "legacyId": "U2Nob29sLTE=" },
        { "domain": "", "legacyId": "U2Nob29sLTE=" }
    ]
};

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'SEARCH_PROFESSOR') {
        handleSearchProfessor(request, sendResponse);
        return true;
    }
    if (request.action === 'MANUAL_SCHOOL_OVERRIDE') {
        handleManualOverride(request, sendResponse);
        return true;
    }
});

// Sticky Context Cache
let cachedContext = {
    schoolID: null,
    schoolName: null,
    domain: null
};

// ... (retain schoolsData if needed, or remove if using full API)

/**
 * 3-Tier Search Waterfall with Strict Fuzzy Matching
 */
async function handleSearchProfessor(request, sendResponse) {
    try {
        const { name, schoolDomain, schoolName, department, course } = request.payload;

        // Define these FIRST before using them anywhere
        const cleanName = (n) => n.replace(/^(?:Prof\.|Dr\.|Mr\.|Ms\.|Mrs\.)\s+/i, '').trim();
        const searchTerm = cleanName(name);
        const normalizedDept = normalizeDepartment(department);

        let schoolID = null;
        let resolvedSchoolName = null;

        // 1. Resolve School
        // Check Sticky Cache first (if domain matches or it's a manual override chain)
        if (cachedContext.schoolID && cachedContext.domain === schoolDomain) {
            schoolID = cachedContext.schoolID;
            resolvedSchoolName = cachedContext.schoolName;
            console.log('[RMP] Using Sticky School:', resolvedSchoolName);
        } else if (schoolName) {
            // New School Hint -> Resolve
            const schoolResult = await rmpService.searchSchool(schoolName);
            if (schoolResult) {
                schoolID = schoolResult.id;
                resolvedSchoolName = schoolResult.name;
                // Update Cache
                cachedContext = { schoolID, schoolName: resolvedSchoolName, domain: schoolDomain };
            }
        }

        if (!schoolID) {
            // STEP A-2: GLOBAL SEARCH FALLBACK
            // The user wants to search "regardless of system", so if no school is found, we try Global.
            console.log('[RMP] No School Context. Trying Global Search for:', searchTerm);

            const globalResults = await rmpService.searchTeacherGlobal(searchTerm);

            if (globalResults.length > 0) {
                sendResponse({
                    success: true,
                    data: globalResults.slice(0, 5), // Top 5 Global Matches
                    schoolName: 'Global Search' // Signal to UI
                });
                return;
            }

            // If Global fails too, then we error.
            sendResponse({ success: false, schoolName: null, error: 'School not detected and no global match found.' });
            return;
        }

        console.log(`[RMP] Search: "${searchTerm}" @ ${resolvedSchoolName || schoolID} (Dept: ${normalizedDept})`);

        let results = [];

        // --- TIER 1: Exact Match (Full Name) ---
        results = await rmpService.searchProfessor(searchTerm, schoolID);

        // --- TIER 2 & 3: Fallback (Last Name Only) ---
        if (results.length === 0 && searchTerm.includes(' ')) {
            const parts = searchTerm.split(' ');
            const lastName = parts[parts.length - 1]; // Assume last word is surname
            const firstName = parts[0];

            console.log(`[RMP] Tier 1 empty. Tier 2/3 fallback: Last Name "${lastName}"`);

            // Search by Last Name (Broad)
            let candidates = await rmpService.searchProfessor(lastName, schoolID);

            if (candidates.length > 0) {
                // Apply Scoring Logic to Pick Best Candidate
                candidates.forEach(p => {
                    p.matchScore = scoreProfessor(p, searchTerm, normalizedDept);
                });

                // Sort by Score
                candidates.sort((a, b) => b.matchScore - a.matchScore);

                // Tier 2 Strict Filter: If we have a Department Context, enforce it (or boost heavily)
                if (normalizedDept) {
                    const deptMatches = candidates.filter(p => p.matchScore >= 15); // Score includes dept match bonuses
                    if (deptMatches.length > 0) {
                        results = deptMatches;
                    } else {
                        // Relax: Maybe department is wrong/generic, fall back to high name match
                        results = candidates.filter(p => p.matchScore >= 30); // High name match
                    }
                } else {
                    // Tib 3: No Dept Context, just Name Match
                    results = candidates.filter(p => p.matchScore >= 30);
                }
            }
        }

        // --- GLOBAL FALLBACK FOR SCOPED SEARCH ---
        // If we HAD a school, but found NO results, maybe the user wants to check other schools?
        // "search the name don't matter which system" might imply this too.
        if (results.length === 0) {
            console.log('[RMP] Scoped search empty. Trying Global Search as last resort.');
            const globalFallback = await rmpService.searchTeacherGlobal(searchTerm);
            if (globalFallback.length > 0) {
                results = globalFallback;
                resolvedSchoolName = 'Global Search'; // Update context
            }
        }

        if (results.length > 0) {
            // Return top result(s)
            sendResponse({
                success: true,
                data: results.slice(0, 5),
                // If it was a global search, providing 'Global Search' or null lets the UI handle it differently?
                // The UI currently shows `${prof.department} • ${data.schoolName}`
                // If data.schoolName is 'Global Search', it will show "Computer Science • Global Search" which is okay-ish.
                // Better: The UI updates to show specific school names if data.schoolName is vague.
                schoolName: resolvedSchoolName
            });
        } else {
            sendResponse({
                success: false,
                schoolName: resolvedSchoolName,
                error: 'Professor not found.'
            });
        }

    } catch (error) {
        console.error(error);
        sendResponse({ success: false, error: error.message });
    }
}

async function handleManualOverride(request, sendResponse) {
    try {
        const { schoolName, originalRequest } = request.payload;
        console.log('[RMP] Manual Override:', schoolName);

        // Resolve School
        const schoolResult = await rmpService.searchSchool(schoolName);
        if (!schoolResult) {
            sendResponse({ success: false, error: 'School not found' });
            return;
        }

        // Update Sticky Cache GLOBAL (for this domain)
        cachedContext = {
            schoolID: schoolResult.id,
            schoolName: schoolResult.name,
            domain: originalRequest.schoolDomain || 'manual-override'
        };

        // Save to chrome.storage.local for persistence
        const storageKey = `school_override_${originalRequest.schoolDomain}`;
        chrome.storage.local.set({
            [storageKey]: {
                schoolID: schoolResult.id,
                schoolName: schoolResult.name,
                timestamp: Date.now()
            }
        }, () => {
            console.log('[RMP] Saved school preference for', originalRequest.schoolDomain);
        });

        // Re-run Search logic
        // We construct a pseudo-request
        const newRequest = {
            payload: {
                ...originalRequest,
                schoolName: schoolResult.name, // Ensure we use the resolved name
                schoolDomain: cachedContext.domain
            }
        };

        await handleSearchProfessor(newRequest, sendResponse);

    } catch (error) {
        console.error(error);
        sendResponse({ success: false, error: error.message });
    }
}


