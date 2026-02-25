interface HuggingFaceWhoAmIResponse {
  name?: string;
}

export interface HuggingFaceTokenVerificationResult {
  valid: boolean;
  username?: string;
  error?: string;
}

export async function verifyHuggingFaceToken(
  token: string,
  fetchImpl: typeof fetch = fetch
): Promise<HuggingFaceTokenVerificationResult> {
  try {
    const response = await fetchImpl('https://huggingface.co/api/whoami-v2', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        return { valid: false, error: 'Invalid token' };
      }
      return { valid: false, error: `HuggingFace API error: ${response.status}` };
    }

    const data = await response.json() as HuggingFaceWhoAmIResponse;
    return { valid: true, username: data.name };
  } catch {
    return { valid: false, error: 'Failed to connect to HuggingFace' };
  }
}
