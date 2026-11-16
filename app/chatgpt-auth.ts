import { redirect } from "next/navigation";

export type ChatGPTUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};

// Backward-compatible function name for the existing workspace code. Identity now
// comes exclusively from Relay's own HttpOnly session, never platform headers.
export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const {ownIdentity}=await import('../lib/server/auth');
  return ownIdentity();
}

export async function requireChatGPTUser(
  returnTo: string,
): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;

  redirect(chatGPTSignInPath(returnTo));
}

// Compatibility exports retained for older imports; no platform authentication
// endpoint is used by Relay's independent account flow.
export function chatGPTSignInPath(_returnTo:string):string{return '/login'}
export function chatGPTSignOutPath(_returnTo='/'):string{return '/qa'}
