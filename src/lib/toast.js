import { toast } from 'sonner';

export const notify = {
  success: (msg) => toast.success(msg),
  error: (msg) => toast.error(msg),
  info: (msg) => toast(msg),
  warning: (msg) => toast.warning(msg),
};
