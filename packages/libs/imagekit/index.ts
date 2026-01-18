import ImageKit from "imagekit";

// Lazy ImageKit client initialization (prevents crash on startup if env vars missing)
// Client is only created when actually needed (when upload/delete operations are called)
let imagekitClient: ImageKit | null = null;

function getImageKitClient(): ImageKit {
  // Return existing client if already created
  if (imagekitClient) {
    return imagekitClient;
  }
  
  // Check if required env vars are present
  const publicKey = process.env.IMAGEKIT_PUBLIC_KEY;
  const privateKey = process.env.IMAGEKIT_SECRET_KEY;
  
  if (!publicKey || !privateKey) {
    // Fail-fast with clear error when ImageKit is actually needed
    // This allows services to start in smoke tests (ImageKit only used for upload endpoints)
    // but will fail with clear error when upload is attempted
    throw new Error(
      "[ImageKit] Configuration missing: IMAGEKIT_PUBLIC_KEY and IMAGEKIT_SECRET_KEY are required. " +
      "Set these env vars or the image upload functionality will not work."
    );
  }
  
  // Create client only when needed and env vars are present
  imagekitClient = new ImageKit({
    publicKey,
    privateKey,
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT || "https://ik.imagekit.io/gglobal",
  });
  
  return imagekitClient;
}

// Export proxy object that lazily initializes ImageKit client
// This prevents crash on startup (initialization happens on first method call)
// If env vars are missing, return a no-op that throws only when methods are called
export const imagekit = new Proxy({} as ImageKit, {
  get(_target, prop) {
    try {
      const client = getImageKitClient();
      const value = (client as any)[prop];
      // If it's a function, bind it to the client
      if (typeof value === "function") {
        return value.bind(client);
      }
      return value;
    } catch (error: any) {
      // If initialization fails (missing env vars), return a no-op function
      // that throws a clear error only when actually used
      if (typeof prop === "string" && prop in ImageKit.prototype) {
        return (...args: any[]) => {
          throw new Error(
            `[ImageKit] Cannot use ImageKit.${prop}: ${error.message}. ` +
            "Set IMAGEKIT_PUBLIC_KEY and IMAGEKIT_SECRET_KEY environment variables."
          );
        };
      }
      // For non-function properties, return undefined
      return undefined;
    }
  },
});
