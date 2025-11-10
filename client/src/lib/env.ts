// Helper to get Cloudinary configuration from API
let cloudinaryConfig: { cloudName: string; uploadPreset: string } | null = null;

export async function getCloudinaryConfig() {
  if (cloudinaryConfig) return cloudinaryConfig;

  try {
    const response = await fetch("/api/config/cloudinary");
    cloudinaryConfig = await response.json();
    return cloudinaryConfig;
  } catch (error) {
    console.error("Failed to fetch Cloudinary config:", error);
    return { cloudName: "", uploadPreset: "" };
  }
}
