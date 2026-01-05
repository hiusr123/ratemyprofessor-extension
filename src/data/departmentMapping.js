/**
 * Robust Department Mapping
 * Normalizes various abbreviations and course codes to RMP-friendly Department names.
 */
export const DEPARTMENT_MAP = {
    // Computer Science & Engineering
    'cs': 'Computer Science',
    'cse': 'Computer Science',
    'css': 'Computer Science',
    'cis': 'Computer Science',
    'compsci': 'Computer Science',
    'eecs': 'Electrical Engineering',
    'ee': 'Electrical Engineering',
    'ce': 'Computer Engineering',
    'swe': 'Software Engineering',

    // Sciences
    'bio': 'Biology',
    'biol': 'Biology',
    'chem': 'Chemistry',
    'phys': 'Physics',
    'math': 'Mathematics',
    'stat': 'Statistics',
    'psych': 'Psychology',
    'psy': 'Psychology',
    'soc': 'Sociology',
    'anthro': 'Anthropology',

    // Humanities
    'eng': 'English',
    'engl': 'English',
    'hist': 'History',
    'phil': 'Philosophy',
    'rel': 'Religion',
    'art': 'Art',
    'mus': 'Music',

    // Business
    'bus': 'Business',
    'mkt': 'Marketing',
    'mktg': 'Marketing',
    'acc': 'Accounting',
    'acct': 'Accounting',
    'fin': 'Finance',
    'mgmt': 'Management',
    'econ': 'Economics',

    // Other
    'comm': 'Communications',
    'poly': 'Political Science',
    'pol': 'Political Science',
    'gov': 'Political Science',
    'nurs': 'Nursing',
    'edu': 'Education'
};

/**
 * Normalizes a department string.
 * @param {string} input 
 * @returns {string} Normalized name or original input
 */
export function normalizeDepartment(input) {
    if (!input) return null;
    const clean = input.toLowerCase().replace(/[^a-z]/g, '');
    return DEPARTMENT_MAP[clean] || input;
}
