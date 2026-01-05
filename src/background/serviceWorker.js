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
        return true; // Keep channel open
    }
});

// Sticky Context Cache
let cachedContext = {
    schoolID: null,
    schoolName: null,
    domain: null
};

/**
 * 3-Tier Search Waterfall
 * 1. Exact Match (Name + School)
 * 2. Dept Context Match (Dept + School)
 * 3. Fuzzy/Similiarity Match (Last Name Fallback + Jaro-Winkler)
 */
async function handleSearchProfessor(request, sendResponse) {
    try {
        const { name, schoolDomain, schoolName, department, course } = request.payload;
        let schoolID = null;
        let resolvedSchoolName = null;

        // Reset cache if domain completely changed (e.g. user went from canvas.com to blackboard.com)
        // But many sites share domains or subdomains, so be careful. 
        // If domain is "manual-override", we don't clear.
        if (schoolDomain !== 'manual-override' && cachedContext.domain && !schoolDomain.includes(cachedContext.domain) && !cachedContext.domain.includes(schoolDomain)) {
            // Optional: Clear cache if moving between vastly different sites?
            // For now, let's allow "sticky" behavior to be aggressive as requested.
        }

        // --- Step A: Resolve School ---
        // 1. Static Mapping
        const mapping = schoolsData.mappings.find(m => m.domain && schoolDomain.includes(m.domain));
        if (mapping) schoolID = mapping.legacyId;

        // 2. Dynamic Search
        // Trigger if:
        // A) We have a new hint (schoolName) -> Resolve it.
        // B) We DON'T have a hint, but we have a Cache -> Use Cache.

        if (!schoolID) {
            if (schoolName) {
                // Try resolving the new hint
                console.log('[RMP] Resolving school hint:', schoolName);
                const schoolResult = await rmpService.searchSchool(schoolName);
                if (schoolResult) {
                    schoolID = schoolResult.id;
                    resolvedSchoolName = schoolResult.name;
                }
            }

            // Interaction with Cache
            if (schoolID) {
                // We found a new one! Update Cache.
                cachedContext = { schoolID, schoolName: resolvedSchoolName, domain: schoolDomain };
            } else if (cachedContext.schoolID) {
                // Detection failed, but we have a Sticky School from before. Use it!
                console.log('[RMP] Using Sticky School:', cachedContext.schoolName);
                schoolID = cachedContext.schoolID;
                resolvedSchoolName = cachedContext.schoolName;
            }
        } else {
            // We found valid mapping, update cache
            cachedContext = { schoolID, schoolName: 'Mapped School', domain: schoolDomain };
        }

        // 3. Fallback to Wildcard
        if (!schoolID) {
            const wildcard = schoolsData.mappings.find(m => m.domain === "");
            if (wildcard) schoolID = wildcard.legacyId;
        }

        if (!schoolID) {
            sendResponse({ success: false, error: 'School not found. Automatic detection failed.' });
            return;
        }

        // --- Step B: Search Strategy ---

        // Normalize Department Context
        const normalizedDept = normalizeDepartment(department);
        console.log(`[RMP] Search: ${name} @ ${resolvedSchoolName || schoolID} (Dept: ${normalizedDept})`);

        // Clean Name
        const cleanName = (n) => n.replace(/^(?:Prof\.|Dr\.|Mr\.|Ms\.|Mrs\.)\s+/i, '').trim();
        const searchTerm = cleanName(name);

        // Tier 1 & 3 Combined: Search by Name (RMP fuzzy logic) then locally re-score
        let results = await rmpService.searchProfessor(searchTerm, schoolID);

        // Tier 3 Fallback: Last Name Only (if full name yielded nothing)
        if (results.length === 0 && searchTerm.includes(' ')) {
            const lastName = searchTerm.split(' ').pop();
            console.log(`[RMP] Tier 1 failed. Fallback to Tier 3 (Last Name: ${lastName})`);
            results = await rmpService.searchProfessor(lastName, schoolID);
        }

        // --- Step C: Intelligent Scoring & Sorting ---
        if (results.length > 0) {
            results.forEach(p => {
                p.matchScore = scoreProfessor(p, searchTerm, normalizedDept);

                // Tier 2: Department Logic Boost (already in scoreProfessor but explicit check)
                if (normalizedDept && p.department === normalizedDept) {
                    p.matchScore += 10;
                }
            });

            // Sort by Intelligent Score
            results.sort((a, b) => b.matchScore - a.matchScore);

            // Filter
            results = results.filter(p => p.matchScore > 10).slice(0, 5);
        }

        sendResponse({
            success: true,
            data: results,
            schoolName: resolvedSchoolName,
            searchMeta: {
                tier: results.length > 0 ? (searchTerm.includes(' ') ? 'Exact' : 'Fuzzy') : 'None',
                query: searchTerm
            }
        });

    } catch (error) {
        console.error(error);
        sendResponse({ success: false, error: error.message });
    }
}

// Side Panel behavior
if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
        .catch((error) => console.error(error));
}
