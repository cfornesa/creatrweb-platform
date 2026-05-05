import { ApiError } from "@workspace/api-client-react";

export function getAiFailureMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const payload = error.data;
    const payloadMessage =
      typeof payload === "object" &&
      payload !== null &&
      typeof (payload as { error?: unknown }).error === "string"
        ? (payload as { error: string }).error
        : null;

    if (payloadMessage && payloadMessage.toLowerCase().includes("timed out")) {
      return "The AI provider timed out. Try again.";
    }

    if (payloadMessage) {
      return payloadMessage;
    }

    if (error.status >= 500) {
      return "The AI request failed. Try again.";
    }
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof (error as { response?: unknown }).response === "object" &&
    (error as { response?: unknown }).response !== null
  ) {
    const response = (error as { response: { data?: { error?: unknown } } }).response;
    if (typeof response.data?.error === "string") {
      return response.data.error;
    }
  }

  return "Failed to process text with AI";
}
