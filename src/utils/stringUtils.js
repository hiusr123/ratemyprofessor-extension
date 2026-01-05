/**
 * Jaro-Winkler string similarity algorithm.
 * Returns a score between 0 (no match) and 1 (perfect match).
 * Optimized for short strings like names.
 */
export function jaroWinkler(s1, s2) {
    let m = 0;

    // Exit early if either string is empty
    if (s1.length === 0 || s2.length === 0) return 0;

    s1 = s1.toLowerCase();
    s2 = s2.toLowerCase();

    const matchWindow = Math.floor(Math.max(s1.length, s2.length) / 2.0) - 1;
    const matches1 = new Array(s1.length).fill(false);
    const matches2 = new Array(s2.length).fill(false);

    for (let i = 0; i < s1.length; i++) {
        const start = Math.max(0, i - matchWindow);
        const end = Math.min(i + matchWindow + 1, s2.length);

        for (let j = start; j < end; j++) {
            if (!matches2[j] && s1[i] === s2[j]) {
                matches1[i] = true;
                matches2[j] = true;
                m++;
                break;
            }
        }
    }

    if (m === 0) return 0;

    let t = 0;
    let k = 0;
    for (let i = 0; i < s1.length; i++) {
        if (matches1[i]) {
            while (!matches2[k]) k++;
            if (s1[i] !== s2[k]) t++;
            k++;
        }
    }
    t /= 2;

    let dw = ((m / s1.length) + (m / s2.length) + ((m - t) / m)) / 3;

    // Winkler Boost (prefix bonus)
    let l = 0;
    const p = 0.1;
    while (l < 4 && s1[l] === s2[l]) l++;

    return dw + (l * p * (1 - dw));
}

// Common Nickname Mapping (Expanded)
const COMMON_NICKNAMES = {
    'liz': ['elizabeth', 'liza', 'beth'],
    'beth': ['elizabeth', 'bethany'],
    'bill': ['william'],
    'will': ['william', 'willard'],
    'bob': ['robert'],
    'rob': ['robert'],
    'dick': ['richard', 'rich'],
    'rich': ['richard'],
    'tom': ['thomas'],
    'chris': ['christopher', 'christian', 'christina'],
    'mike': ['michael'],
    'matt': ['matthew'],
    'jon': ['jonathan', 'john'],
    'john': ['jonathan'],
    'alex': ['alexander', 'alexandra', 'alexis'],
    'sam': ['samuel', 'samantha'],
    'dan': ['daniel'],
    'danny': ['daniel'],
    'dave': ['david'],
    'andy': ['andrew'],
    'joe': ['joseph'],
    'steve': ['stephen', 'steven'],
    'jen': ['jennifer'],
    'jenny': ['jennifer'],
    'kat': ['katherine', 'kathryn', 'kathleen'],
    'kate': ['katherine', 'kathryn'],
    'kathy': ['katherine', 'kathleen'],
    'becky': ['rebecca'],
    'bec': ['rebecca'],
    'sue': ['susan', 'suzanne'],
    'pat': ['patrick', 'patricia'],
    'nick': ['nicholas'],
    'nate': ['nathan', 'nathaniel'],
    'ben': ['benjamin'],
    'fred': ['frederick'],
    'greg': ['gregory'],
    'ed': ['edward', 'edwin'],
    'ted': ['theodore', 'edward'],
    'tim': ['timothy'],
    'jim': ['james'],
    'jimmy': ['james'],
    'josh': ['joshua'],
    'ken': ['kenneth'],
    'lizzy': ['elizabeth']
};

/**
 * Checks if two names are nickname variations of each other.
 */
function isNicknameMatch(name1, name2) {
    if (!name1 || !name2) return false;
    const n1 = name1.toLowerCase();
    const n2 = name2.toLowerCase();

    if (n1 === n2) return true;

    // Check if n1 is a nick of n2
    if (COMMON_NICKNAMES[n1] && COMMON_NICKNAMES[n1].includes(n2)) return true;

    // Check if n2 is a nick of n1
    if (COMMON_NICKNAMES[n2] && COMMON_NICKNAMES[n2].includes(n1)) return true;

    // Check if both match a common root (e.g. Liz and Beth -> Elizabeth)
    // (This is overkill for now, but direct mapping suffices)

    return false;
}

/**
 * Calculates a match score for a professor object against a search query.
 * @param {Object} prof - RMP Professor object
 * @param {string} searchName - The name searched
 * @param {string} searchDept - The department context (optional)
 * @returns {number} Score
 */
export function scoreProfessor(prof, searchName, searchDept) {
    let score = 0;
    const pFirst = prof.firstName.toLowerCase();
    const pLast = prof.lastName.toLowerCase();
    const parts = searchName.toLowerCase().split(' ');
    const sFirst = parts[0];
    const sLast = parts[parts.length - 1]; // Assume last word is surname

    // 1. Last Name Match (Critical)
    const lastScore = jaroWinkler(pLast, sLast);
    if (lastScore > 0.9) score += 50;
    else if (lastScore > 0.8) score += 30; // Typo tolerance
    else return 0; // Last name mismatch usually means wrong person

    // 2. First Name Match (Fuzzy allowed)
    // 'Jon' vs 'Jonathan'
    const firstScore = jaroWinkler(pFirst, sFirst);

    if (firstScore > 0.9) {
        score += 40; // Exact match
    } else if (isNicknameMatch(sFirst, pFirst)) {
        score += 35; // Nickname Match (High Confidence)
    } else if (firstScore > 0.8) {
        score += 25; // Close Typo
    } else if (pFirst.includes(sFirst) || sFirst.includes(pFirst)) {
        score += 20; // Substring match
    } else {
        score += (firstScore * 10); // Weak match
    }

    // 3. Department Bonus
    if (searchDept) {
        const pDeptNormalized = prof.department.toLowerCase().replace(/[^a-z]/g, '');
        const sDeptNormalized = searchDept.toLowerCase().replace(/[^a-z]/g, '');

        if (pDeptNormalized.includes(sDeptNormalized) || sDeptNormalized.includes(pDeptNormalized)) {
            score += 15;
        }
    }

    return score;
}
