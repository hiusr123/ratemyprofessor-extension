/**
 * Side Panel Logic
 */

const views = {
    empty: document.getElementById('empty-state'),
    loading: document.getElementById('loading-state'),
    results: document.getElementById('results-state'),
    notFound: document.getElementById('not-found-state')
};

const resultsContainer = document.getElementById('results-list');
const template = document.getElementById('professor-card-template').innerHTML;

// Initialize
chrome.storage.local.get(['currentSearch'], (result) => {
    if (result.currentSearch) {
        render(result.currentSearch);
    }
});

// Listen for updates
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.currentSearch) {
        const newData = changes.currentSearch.newValue;
        render(newData);
        // Only update school indicator if we have a new name, or empty to clear?
        // If we switched context (newData.schoolName exists), update.
        // If newData has NO schoolName (null), it might be a raw search? 
        // We'll trust the backend to always return schoolName if it found one.
        if (newData.schoolName) {
            updateSchoolIndicator(newData.schoolName);
        }
    }
});

function updateSchoolIndicator(name) {
    const existing = document.getElementById('school-indicator');
    if (existing) {
        existing.innerText = name;
    } else {
        const header = document.querySelector('.header');
        const badge = document.createElement('div');
        badge.id = 'school-indicator';
        badge.style.fontSize = '0.7em';
        badge.style.color = '#94a3b8';
        badge.style.marginTop = '0.2rem';
        badge.innerText = name;
        // Insert under the h1 title usually, or just append to header
        // Header is flex row, so let's put it in a column with title actually
        // Changing header structure dynamically is risky without changing HTML, 
        // let's just replace the "status-indicator" or unused div.
        const status = document.querySelector('.status-indicator');
        if (status) {
            status.style.maxWidth = '150px';
            status.style.overflow = 'hidden';
            status.style.textOverflow = 'ellipsis';
            status.style.whiteSpace = 'nowrap';
            status.style.fontSize = '0.75rem';
            status.innerText = name;
        }
    }
}

function switchView(viewName) {
    Object.values(views).forEach(el => {
        el.classList.remove('active');
        // Fix: Reset display style managed by CSS class active usually,
        // but ensure we hide others clean.
    });
    views[viewName].classList.add('active');
}

function render(searchData) {
    if (!searchData || !searchData.name) {
        switchView('empty');
        return;
    }

    if (searchData.error) {
        document.getElementById('search-term').innerText = searchData.name;
        document.querySelector('#not-found-state h3').innerText = 'Error';
        document.querySelector('#not-found-state p').innerText = searchData.error;
        document.getElementById('suggestions-area').style.display = 'none';
        switchView('notFound');
        return;
    }

    // Reset failure text just in case
    document.querySelector('#not-found-state h3').innerText = 'Professor Not Found';
    document.querySelector('#not-found-state p').innerHTML = 'We couldn\'t find an exact match for "<span id="search-term">' + searchData.name + '</span>".';
    document.getElementById('suggestions-area').style.display = 'block';

    // If we had a loading state, we would trigger it before result comes,
    // but here we are reacting to data arrival.

    if (!searchData.results || searchData.results.length === 0) {
        document.getElementById('search-term').innerText = searchData.name;
        document.getElementById('dept-context').innerText = searchData.department || 'Unknown Dept';
        switchView('notFound');
        return;
    }

    // Render Results
    resultsContainer.innerHTML = '';
    searchData.results.forEach(prof => {
        const card = document.createElement('div');
        card.innerHTML = template;

        const node = card.querySelector('.professor-card');

        // Populate Data
        node.querySelector('.prof-name').innerText = `${prof.firstName} ${prof.lastName}`;
        node.querySelector('.dept-badge').innerText = prof.department;

        const rating = prof.avgRating;
        node.querySelector('.metric.rating .value').innerText = rating;
        node.querySelector('.metric.rating .value').style.color = getRatingColor(rating);

        node.querySelector('.metric.difficulty .value').innerText = prof.numRatings > 0 ? 'N/A' : 'N/A'; // RMP graphQL might not return difficulty directly in 'newSearch', often needs detail query. Assuming mock or available.
        // Actually difficulty is usually not in the search list result in RMP, only rating. 
        // We'll leave it as placeholder or N/A for this MVP unless we fetch details.

        node.querySelector('.metric.would-take .value').innerText = prof.wouldTakeAgainPercent > 0 ? `${Math.round(prof.wouldTakeAgainPercent)}%` : 'N/A';

        node.querySelector('.rmp-link-btn').href = `https://www.ratemyprofessors.com/professor/${prof.legacyId}`; // LegacyID or 'id' usage depends on RMP URL structure.

        resultsContainer.appendChild(node);
    });

    switchView('results');
}

// Manual School Override
const schoolInput = document.getElementById('school-input');
if (schoolInput) {
    schoolInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const newSchool = schoolInput.value.trim();
            if (newSchool.length > 2) {
                // Trigger updated search
                chrome.storage.local.get(['currentSearch'], (result) => {
                    const current = result.currentSearch;
                    if (current && current.name) {
                        // Re-send to background
                        chrome.runtime.sendMessage({
                            action: 'SEARCH_PROFESSOR',
                            payload: {
                                name: current.name,
                                schoolDomain: 'manual-override', // Skip domain check
                                schoolName: newSchool,
                                department: current.department,
                                course: current.course
                            }
                        }, (response) => {
                            if (response && response.success) {
                                render({
                                    ...current,
                                    schoolName: response.schoolName || newSchool,
                                    results: response.data,
                                    error: null
                                });
                                updateSchoolIndicator(response.schoolName || newSchool);
                            } else {
                                // Show error
                                render({
                                    ...current,
                                    results: [],
                                    error: response ? response.error : 'Failed'
                                });
                            }
                        });
                    }
                });
            }
        }
    });
}

function getRatingColor(rating) {
    if (rating >= 4.0) return '#4ade80'; // Green
    if (rating >= 2.5) return '#facc15'; // Yellow
    return '#f87171'; // Red
}

function getDifficultyColor(rating) {
    if (rating <= 2.5) return '#4ade80'; // Green (Easy)
    if (rating <= 3.8) return '#facc15'; // Yellow (Moderate)
    return '#f87171'; // Red (Hard)
}
