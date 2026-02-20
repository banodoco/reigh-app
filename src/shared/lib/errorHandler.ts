export { handleError } from '@/shared/lib/errorHandling/handleError';
export type { HandleErrorOptions } from '@/shared/lib/errorHandling/handleError';
export {
  AppError,
  NetworkError,
  AuthError,
  SilentError,
  isAppError,
  isAuthError,
  isNetworkError,
} from './errors';
