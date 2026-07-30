import { extractApiError } from "@/utils/apiError";
// Cliente do Chat de Atendimento v2 (/api/attendance).
// Auth por JWT (Bearer) do localStorage — mesmo padrão do restante do app.

const API_BASE = "/api/attendance";

function authHeaders() {
  const token = localStorage.getItem("accessToken");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) },
  });
  if (!res.ok) {
    throw new Error(await extractApiError(res, "Erro na requisição"));
  }
  if (res.status === 204) return null;
  return res.json();
}

export const attendanceApi = {
  listConversations({ search = "", status = "", limit = 100 } = {}) {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    if (limit) params.set("limit", String(limit));
    const qs = params.toString();
    return request(`/conversations${qs ? `?${qs}` : ""}`);
  },
  getMessages(conversationId) {
    return request(`/conversations/${conversationId}/messages`);
  },
  markRead(conversationId) {
    return request(`/conversations/${conversationId}/read`, { method: "POST" });
  },
  sendText(conversationId, message) {
    return request(`/conversations/${conversationId}/send`, {
      method: "POST",
      body: JSON.stringify({ message }),
    });
  },
  sendTemplate(conversationId, { templateId, templateComponents, contentPreview }) {
    return request(`/conversations/${conversationId}/send`, {
      method: "POST",
      body: JSON.stringify({ templateId, templateComponents, contentPreview }),
    });
  },
  getTemplates(conversationId) {
    return request(`/conversations/${conversationId}/templates`);
  },
  claim(conversationId) {
    return request(`/conversations/${conversationId}/claim`, { method: "POST" });
  },
  assign(conversationId, userId) {
    return request(`/conversations/${conversationId}/assign`, {
      method: "POST",
      body: JSON.stringify({ userId }),
    });
  },
  setStatus(conversationId, status) {
    return request(`/conversations/${conversationId}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    });
  },
  // Conexões (admin)
  listConnections() {
    return request(`/connections`);
  },
  createConnection({ name, token, channel }) {
    return request(`/connections`, {
      method: "POST",
      body: JSON.stringify({ name, token, channel }),
    });
  },
  deleteConnection(id) {
    return request(`/connections/${id}`, { method: "DELETE" });
  },
};
