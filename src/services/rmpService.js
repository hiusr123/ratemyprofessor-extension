/**
 * Service to interact with RateMyProfessor's GraphQL API.
 */
class RmpService {
  constructor() {
    this.GRAPHQL_URL = 'https://www.ratemyprofessors.com/graphql';
    this.AUTH_TOKEN = 'dGVzdDp0ZXN0'; // Use a known public token or scrape content for it if needed.
  }

  /**
   * Search for a school by name.
   * @param {string} schoolName
   */
  /**
   * Search for a professor globally by name (no school context).
   * @param {string} professorName 
   */
  async searchTeacherGlobal(professorName) {
    const query = `
      query NewSearchTeachers($text: String!) {
        newSearch {
          teachers(query: {text: $text}) {
            edges {
              node {
                id
                firstName
                lastName
                department
                school {
                  id
                  name
                }
                avgRating
                avgDifficulty
                numRatings
                wouldTakeAgainPercent
                legacyId
              }
            }
          }
        }
      }
    `;

    const variables = { text: professorName };

    try {
      const response = await fetch(this.GRAPHQL_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${this.AUTH_TOKEN}`
        },
        body: JSON.stringify({ query, variables })
      });

      if (!response.ok) throw new Error(`RMP API Error: ${response.status}`);

      const data = await response.json();
      return data.data.newSearch.teachers.edges.map(edge => edge.node);
    } catch (error) {
      console.error('RmpService.searchTeacherGlobal failed:', error);
      return [];
    }
  }

  /**
   * Search for a school by name.
   * @param {string} schoolName
   */
  async searchSchool(schoolName) {
    const query = `
      query NewSearchSchools($query: SchoolSearchQuery!) {
        newSearch {
          schools(query: $query) {
            edges {
              node {
                id
                name
                legacyId
              }
            }
          }
        }
      }
    `;

    const variables = {
      query: { text: schoolName }
    };

    try {
      const response = await fetch(this.GRAPHQL_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${this.AUTH_TOKEN}`
        },
        body: JSON.stringify({ query, variables })
      });

      if (!response.ok) return null;
      const data = await response.json();
      const edges = data.data.newSearch.schools.edges;
      return edges.length > 0 ? edges[0].node : null;
    } catch (error) {
      console.error('RmpService.searchSchool failed:', error);
      return null;
    }
  }

  /**
   * Search for a professor by name and an optional schoolID.
   * If schoolID is provided, it scopes the search.
   * @param {string} professorName 
   * @param {string} schoolID 
   */
  async searchProfessor(professorName, schoolID) {
    const query = `
      query NewSearchTeachers($text: String!, $schoolID: ID!) {
        newSearch {
          teachers(query: {text: $text, schoolID: $schoolID}) {
            edges {
              node {
                id
                firstName
                lastName
                department
                school {
                  id
                  name
                }
                avgRating
                avgDifficulty
                numRatings
                wouldTakeAgainPercent
                legacyId
              }
            }
          }
        }
      }
    `;

    const variables = {
      text: professorName,
      schoolID: schoolID
    };

    try {
      const response = await fetch(this.GRAPHQL_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${this.AUTH_TOKEN}`
        },
        body: JSON.stringify({ query, variables })
      });

      if (!response.ok) {
        throw new Error(`RMP API Error: ${response.status}`);
      }

      const data = await response.json();
      return data.data.newSearch.teachers.edges.map(edge => edge.node);
    } catch (error) {
      console.error('RmpService.searchProfessor failed:', error);
      throw error;
    }
  }

  /**
   * Get specific professor details used for side panel.
   * @param {string} professorId 
   */
  async getProfessorDetails(professorId) {
    return null;
  }

  /**
   * Fuzzy filter by department.
   */
  filterByDepartment(professors, targetDepartment) {
    if (!targetDepartment) return professors;

    // Normalize string for comparison
    const normalize = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const target = normalize(targetDepartment);

    return professors.filter(p => {
      return normalize(p.department).includes(target) || target.includes(normalize(p.department));
    });
  }
}

export default new RmpService();
