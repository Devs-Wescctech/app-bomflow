import { extractApiError } from '@/utils/apiError';

function authHeaders(json = true) {
  const token = localStorage.getItem('accessToken');
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request(path, options = {}) {
  const response = await fetch(`/api/trainings${path}`, {
    ...options,
    headers: { ...authHeaders(options.body !== undefined), ...options.headers },
  });
  if (!response.ok) throw new Error(await extractApiError(response, 'Erro no Portal de Treinamentos'));
  return response.json();
}

export const trainingApi = {
  list: () => request(''),
  create: (data) => request('', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id) => request(`/${id}`, { method: 'DELETE' }),
  reorder: (ids) => request('/order', { method: 'PUT', body: JSON.stringify({ ids }) }),
  access: (id) => request(`/${id}/access`),
  cover: (id) => request(`/${id}/cover`),
  beginUpload: (id, file, kind = 'media') => request(`/${id}/uploads`, {
    method: 'POST',
    body: JSON.stringify({
      kind,
      originalName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    }),
  }),
  completeUpload: (id, uploadId, metadata = {}) => request(`/${id}/uploads/${uploadId}/complete`, {
    method: 'POST',
    body: JSON.stringify(metadata),
  }),
  resumeUpload: (id, uploadId) => request(`/${id}/uploads/${uploadId}/resume`),
  cancelUpload: (id, uploadId) => request(`/${id}/uploads/${uploadId}`, { method: 'DELETE' }),
  uploadFile: async (url, file, onProgress, options = {}) => {
    const probe = async () => {
      if (!options.getConfirmedOffset) {
        throw new Error('Não foi possível confirmar o ponto de retomada.');
      }
      return options.getConfirmedOffset();
    };
    const send = (offset) => new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.setRequestHeader('Content-Range', `bytes ${offset}-${file.size - 1}/${file.size}`);
      const destination = new URL(url, window.location.origin);
      const token = localStorage.getItem('accessToken');
      if (destination.origin === window.location.origin && token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress?.(Math.round(((offset + event.loaded) / file.size) * 100));
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) return resolve(file.size);
        if (xhr.status === 308) return resolve(null);
        reject(new Error(`Falha no envio do arquivo (${xhr.status}).`));
      };
      xhr.onerror = () => reject(new Error('Conexão interrompida durante o envio.'));
      xhr.send(file.slice(offset));
    });
    let offset = Number(options.initialOffset || 0);
    let attempts = 0;
    while (offset < file.size) {
      try {
        const nextOffset = await send(offset);
        offset = nextOffset === null ? await probe() : nextOffset;
        attempts = 0;
      } catch {
        attempts += 1;
        if (attempts >= 3) throw new Error('O envio foi interrompido após três tentativas. Tente novamente.');
        await new Promise((resolve) => setTimeout(resolve, attempts * 1000));
        offset = await probe();
      }
    }
  },
};
