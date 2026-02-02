import "axios";

declare module "axios" {
  export interface AxiosRequestConfig<D = any> {
    requireAuth?: boolean;
    isProtected?: boolean;
  }

  export interface InternalAxiosRequestConfig<D = any> {
    requireAuth?: boolean;
    isProtected?: boolean;
  }
}
