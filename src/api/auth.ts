import { AdminUser } from '../types';
import { apiClient, setAuthToken, ApiResponse } from './client';
import { store } from './store';

export interface LoginCredentials {
  email: string;
  password?: string;
  rememberMe?: boolean;
}

export interface AuthResponseData {
  accessToken: string;
  expiresAt: string;
  user: AdminUser;
}

export const authService = {
  async login(credentials: LoginCredentials): Promise<ApiResponse<AuthResponseData>> {
    const response = await apiClient<AuthResponseData>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: credentials.email.trim(), password: credentials.password || '' }),
    });
    if (response.success && response.data) {
      setAuthToken(response.data.accessToken);
      store.saveCurrentUser(response.data.user);
    }
    return response;
  },

  async getCurrentUser(): Promise<ApiResponse<AdminUser>> {
    const response = await apiClient<AdminUser>('/auth/me');
    if (response.success && response.data) store.saveCurrentUser(response.data);
    return response;
  },

  async logout(): Promise<ApiResponse<null>> {
    try {
      await apiClient('/auth/logout', { method: 'POST' });
    } finally {
      setAuthToken(null);
      store.saveCurrentUser(null);
    }
    return { success: true, data: null, message: 'Logged out successfully' };
  },

  async forgotPassword(_email: string): Promise<ApiResponse<{ dispatched: boolean }>> {
    throw new Error('Password reset is not configured by the backend.');
  },
};
