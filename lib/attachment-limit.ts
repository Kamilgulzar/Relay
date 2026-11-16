export const attachmentLimitMB = process.env.NEXT_PUBLIC_RELAY_VERCEL === '1' ? 4 : 10;
export const maxAttachmentBytes = attachmentLimitMB * 1024 ** 2;
