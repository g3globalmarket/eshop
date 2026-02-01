import axios from "axios";
import { runRedirectToLogin } from "./redirect";

const axiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_SERVER_URI,
  withCredentials: true,
});

let isRefreshing = false;
let refreshSubscribers: (() => void)[] = [];

// Handle logout and prevent infinite loops
const handleLogout = () => {
  const publicPaths = ["/login", "/signup", "/forgot-password"];
  const currentPath = window.location.pathname;
  if (!publicPaths.includes(currentPath)) {
    runRedirectToLogin();
  }
};

// Handle adding a new access token to queued requests
const subscribeTokenRefresh = (callback: () => void) => {
  refreshSubscribers.push(callback);
};

// Execute queued requests after refresh
const onRefreshSuccess = () => {
  refreshSubscribers.forEach((callback) => callback());
  refreshSubscribers = [];
};

// Handle API requests
axiosInstance.interceptors.request.use(
  (config) => {
    // Log auth requirement (no secrets)
    if (config.requireAuth) {
      console.log("[Axios] Request requires authentication", {
        url: config.url,
        method: config.method,
        hasCookies: typeof document !== "undefined" && document.cookie.length > 0,
      });
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Handle expired tokens and refresh logic
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    const is401 = error?.response?.status === 401;
    const isRetry = originalRequest?._retry;
    const isAuthRequired = originalRequest?.requireAuth === true;

    if (is401 && !isRetry && isAuthRequired) {
      console.log("[Axios] 401 error on protected endpoint, attempting token refresh", {
        url: originalRequest?.url,
        method: originalRequest?.method,
      });
      
      if (isRefreshing) {
        return new Promise((resolve) => {
          subscribeTokenRefresh(() => resolve(axiosInstance(originalRequest)));
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        await axios.post(
          `${
            process.env.NEXT_PUBLIC_SERVER_URI || "https://nomadnet.shop"
          }/auth/api/refresh-token`,
          {},
          { withCredentials: true }
        );

        console.log("[Axios] Token refresh successful, retrying request");
        isRefreshing = false;
        onRefreshSuccess();

        return axiosInstance(originalRequest);
      } catch (error) {
        console.log("[Axios] Token refresh failed, redirecting to login");
        isRefreshing = false;
        refreshSubscribers = [];
        handleLogout();
        return Promise.reject(error);
      }
    }
    
    // Log 401 errors on non-protected endpoints (shouldn't happen but helps debug)
    if (is401 && !isAuthRequired) {
      console.warn("[Axios] 401 error on non-protected endpoint", {
        url: originalRequest?.url,
        method: originalRequest?.method,
      });
    }

    return Promise.reject(error);
  }
);

export default axiosInstance;
