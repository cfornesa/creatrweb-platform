export type CurrentUser = {
  id: string;
  name: string;
  username?: string | null;
  email?: string | null;
  imageUrl?: string | null;
  bio?: string | null;
  website?: string | null;
  socialLinks?: Record<string, string> | null;
  role: "owner" | "member";
  status: "active" | "blocked";
  postCount: number;
};

type CsrfResponse = {
  csrfToken: string;
};

const authBasePath = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/auth`;

async function getCsrfToken(): Promise<string> {
  const response = await fetch(`${authBasePath}/csrf`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`Failed to load CSRF token (${response.status})`);
  }

  const data = (await response.json()) as CsrfResponse;
  return data.csrfToken;
}

function submitAuthForm(action: string, fields: Record<string, string>): void {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = action;
  form.style.display = "none";

  Object.entries(fields).forEach(([name, value]) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  });

  document.body.appendChild(form);
  form.submit();
}

export async function signInWithProvider(
  provider: "github" | "google",
  callbackUrl = window.location.pathname + window.location.search,
): Promise<void> {
  const csrfToken = await getCsrfToken();
  submitAuthForm(`${authBasePath}/signin/${provider}`, {
    csrfToken,
    callbackUrl,
  });
}

export async function signOut(
  callbackUrl = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "") || "/"}`,
): Promise<void> {
  const csrfToken = await getCsrfToken();
  submitAuthForm(`${authBasePath}/signout`, {
    csrfToken,
    callbackUrl,
  });
}

export async function fetchCurrentUser(): Promise<CurrentUser | null> {
  const response = await fetch("/api/users/me", {
    credentials: "include",
    headers: {
      accept: "application/json",
    },
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Failed to load current user (${response.status})`);
  }

  return (await response.json()) as CurrentUser;
}
