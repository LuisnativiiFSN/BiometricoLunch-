const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api').replace(
  /\/$/,
  '',
);

interface ApiErrorBody {
  message?: string | string[];
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiRequest<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }

    throw new ApiError(
      'No se pudo conectar con la API. Verifica que NestJS este funcionando.',
      0,
    );
  }

  if (!response.ok) {
    let body: ApiErrorBody | undefined;

    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      body = undefined;
    }

    const message = Array.isArray(body?.message)
      ? body.message.join('. ')
      : body?.message;

    if (response.status === 401 && path !== '/auth/login') {
      window.dispatchEvent(new Event('auth:unauthorized'));
    }

    throw new ApiError(
      message ?? 'No fue posible completar la solicitud',
      response.status,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
