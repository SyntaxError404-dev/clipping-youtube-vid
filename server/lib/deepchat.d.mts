export function chat(
  message: string,
  options?: Record<string, unknown>
): Promise<{ reply: string; creditsUsed?: number; creditsRemaining?: number; model?: string }>;
export function generateImage(prompt: string, options?: Record<string, unknown>): Promise<{ images: string[]; provider?: string; model?: string; creditsUsed?: number; creditsRemaining?: number }>;
export function imageToImage(
  prompt: string,
  imageInput: string,
  options?: Record<string, unknown>
): Promise<{ images: string[]; provider?: string; model?: string; creditsUsed?: number; creditsRemaining?: number }>;
export function editImage(
  imageUrlOrBase64: string,
  prompt: string,
  options?: Record<string, unknown>
): Promise<{ imageUrl?: string }>;
export function faceSwap(
  sourceImageUrlOrBase64: string,
  targetImageUrlOrBase64: string,
  options?: Record<string, unknown>
): Promise<unknown>;
export function humanize(
  text: string,
  options?: Record<string, unknown>
): Promise<{ humanizedText: string }>;
export function optimizePrompt(prompt: string, options?: Record<string, unknown>): Promise<unknown>;
export function getBalance(): Promise<unknown>;
export function claimReward(type?: string): Promise<unknown>;
export function getConfig(): Promise<unknown>;
export function downloadMedia(url: string, options?: Record<string, unknown>): Promise<Buffer>;
