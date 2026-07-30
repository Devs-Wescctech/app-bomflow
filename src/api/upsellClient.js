import { extractApiError } from "@/utils/apiError";
const API_BASE = '/api';

function getAuthHeaders() {
  const token = localStorage.getItem('accessToken');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

async function fetchAPI(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...getAuthHeaders(),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw new Error(await extractApiError(response, 'API Error'));
  }

  return response.json();
}

function createEntityClient(entityName) {
  const endpoint = `/${entityName}`;
  return {
    list: async (sort, limit) => {
      const params = new URLSearchParams();
      if (sort) params.append('sort', sort);
      if (limit) params.append('limit', limit);
      const query = params.toString() ? `?${params.toString()}` : '';
      return fetchAPI(`${endpoint}${query}`);
    },
    get: async (id) => fetchAPI(`${endpoint}/${id}`),
    create: async (data) => fetchAPI(endpoint, { method: 'POST', body: JSON.stringify(data) }),
    update: async (id, data) => fetchAPI(`${endpoint}/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: async (id) => fetchAPI(`${endpoint}/${id}`, { method: 'DELETE' }),
    filter: async (filters) => fetchAPI(`${endpoint}/filter`, { method: 'POST', body: JSON.stringify(filters) }),
  };
}

export const upsell = {
  entities: {
    LeadUpsell: createEntityClient('leads-upsell'),
    ActivityUpsell: createEntityClient('activities-upsell'),
    VisitUpsell: createEntityClient('visits-upsell'),
    SalesGoalUpsell: createEntityClient('sales-goals-upsell'),
    LeadHistoryUpsell: createEntityClient('lead-history-upsell'),
    LeadUpsellAutomation: createEntityClient('lead-upsell-automations'),
  },
};

export default upsell;
