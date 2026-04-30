import { getAdminSettings } from "@/lib/settings";

export async function getAdminCredentials() {
  return getAdminSettings();
}
