import { z } from 'zod';

interface ResearchNotificationOptions {
  enabled: boolean;
  email?: string;
  appUrl: string;
}

export function buildResearchNotification({
  enabled,
  email,
  appUrl,
}: ResearchNotificationOptions):
  { email: string; custom_url: string } | undefined {
  if (!enabled) return undefined;
  const recipient = z.email().safeParse(email?.trim());
  if (!recipient.success) return undefined;
  try {
    const url = new URL(appUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return undefined;
    return {
      email: recipient.data,
      custom_url: `${url.origin}/?research={id}`,
    };
  } catch {
    return undefined;
  }
}
