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
        let candidates = [];

        // Parse name into parts
        const nameParts = searchTerm.split(' ').filter(p => p.length > 0);
        const lastName = nameParts[nameParts.length - 1];
        const firstName = nameParts[0];

        // --- STRATEGY: Search by LAST NAME (most reliable identifier) ---
        console.log(`[RMP] Searching by Last Name: "${lastName}"`);
        candidates = await rmpService.searchProfessor(lastName, schoolID);

        if (candidates.length === 0) {
            // Try full name as fallback (in case RMP requires it)
            console.log(`[RMP] Last name search empty, trying full name: "${searchTerm}"`);
            candidates = await rmpService.searchProfessor(searchTerm, schoolID);
        }

        if (candidates.length > 0) {
            console.log(`[RMP] Found ${candidates.length} candidates, applying filters...`);

            // Score each candidate
            candidates.forEach(p => {
                p.matchScore = scoreProfessor(p, searchTerm, normalizedDept);
            });

            // Sort by score (highest first)
            candidates.sort((a, b) => b.matchScore - a.matchScore);

            // --- FILTERING LOGIC ---
            if (normalizedDept) {
                // STRICT: If we have department context, REQUIRE department match
                console.log(`[RMP] Filtering by department: "${normalizedDept}"`);

                // First try: Exact department match
                let deptMatches = candidates.filter(p => {
                    const profDept = (p.department || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                    const targetDept = normalizedDept.toLowerCase().replace(/[^a-z0-9]/g, '');
                    return profDept.includes(targetDept) || targetDept.includes(profDept);
                });

                if (deptMatches.length > 0) {
                    results = deptMatches;
                    console.log(`[RMP] Found ${results.length} department matches`);
                } else {
                    // Fallback: Maybe dept is wrong, but if there's only 1 prof with that last name, use them
                    if (candidates.length === 1) {
                        console.log(`[RMP] No dept match but only 1 candidate, using them`);
                        results = candidates;
                    } else {
                        console.log(`[RMP] Multiple candidates but no dept match - taking top scored`);
                        // Take top 3 highest scored even without dept match
                        results = candidates.slice(0, 3);
                    }
                }
            } else {
                // No department context - use name matching only
                console.log(`[RMP] No department context, using name match only`);

                // If we have firstName, prefer candidates with matching first name
                if (nameParts.length > 1) {
                    const firstNameMatches = candidates.filter(p =>
                        (p.firstName || '').toLowerCase().startsWith(firstName.toLowerCase())
                    );

                    if (firstNameMatches.length > 0) {
                        results = firstNameMatches.slice(0, 3);
                    } else {
                        results = candidates.slice(0, 3);
                    }
                } else {
                    // Only last name provided
                    results = candidates.slice(0, 3);
                }
            }
        }

        // --- GLOBAL FALLBACK ---
        if (results.length === 0) {
            console.log('[RMP] Scoped search empty. Trying Global Search as last resort.');
            const globalFallback = await rmpService.searchTeacherGlobal(lastName);
            if (globalFallback.length > 0) {
                // Apply same filtering logic
                globalFallback.forEach(p => {
                    p.matchScore = scoreProfessor(p, searchTerm, normalizedDept);
                });
                globalFallback.sort((a, b) => b.matchScore - a.matchScore);

                results = globalFallback.slice(0, 5);
                resolvedSchoolName = 'Global Search';
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


