type ApiErrorLike = {
  response?: { data?: { error?: string; message?: string } };
  message?: string;
};

export function getApiErrorMessage(error: unknown, fallback: string): string {
  const typedError = error as ApiErrorLike;
  return (
    typedError.response?.data?.error ||
    typedError.response?.data?.message ||
    typedError.message ||
    fallback
  );
}

export const formatRefreshedAt = (data: Record<string, unknown> | null): string => {
  if (!data?.refreshed_at) return "Never refreshed";
  const date = new Date(data.refreshed_at as string);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};
