/**
 * Fixed synthetic guest the journey checks out with. Every value is fake and
 * identifies the monitor, so anyone who sees an abandoned cart or a saved
 * address on the site knows where it came from.
 */
export interface GuestProfile {
  email: string;
  /** The site caps first and last name at 20 characters. */
  firstName: string;
  lastName: string;
  /** 10 digits, the site's limit. */
  phone: string;
  /**
   * Text typed into the address search (Google Places). The site fills street,
   * number, postal code, colonia, municipality and state from the first
   * suggestion; typing those fields by hand left the state wrong on the live site.
   */
  address: string;
  /** Must appear in the saved address: proves the site accepted it. */
  postalCode: string;
  /** "Referencias" (delivery notes). */
  references: string;
}

export const DEFAULT_GUEST_PROFILE: GuestProfile = Object.freeze({
  email: "sentinel-qa@chupaprecios.com.mx",
  firstName: "Sentinel",
  lastName: "QA Monitor",
  phone: "5555555555",
  address: "Avenida Paseo de la Reforma 222, Juárez, 06600 Ciudad de México",
  postalCode: "06600",
  references: "Sentinel QA synthetic monitor, not a real order",
});

const ENV_KEYS: Record<keyof GuestProfile, string> = {
  email: "SENTINEL_GUEST_EMAIL",
  firstName: "SENTINEL_GUEST_FIRST_NAME",
  lastName: "SENTINEL_GUEST_LAST_NAME",
  phone: "SENTINEL_GUEST_PHONE",
  address: "SENTINEL_GUEST_ADDRESS",
  postalCode: "SENTINEL_GUEST_POSTAL_CODE",
  references: "SENTINEL_GUEST_REFERENCES",
};

/** The default profile with any non-blank `SENTINEL_GUEST_*` variable overriding its field. */
export function guestProfileFromEnv(env: Record<string, string | undefined>): GuestProfile {
  const profile = { ...DEFAULT_GUEST_PROFILE };
  for (const [field, key] of Object.entries(ENV_KEYS) as [keyof GuestProfile, string][]) {
    const value = env[key]?.trim();
    if (value) profile[field] = value;
  }
  return profile;
}
