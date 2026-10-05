import { describe, expect, it } from "vitest";
import { DEFAULT_GUEST_PROFILE, guestProfileFromEnv } from "../../src/site/guest-profile.ts";

describe("guest profile", () => {
  it("is clearly synthetic and identifiable as the monitor", () => {
    expect(DEFAULT_GUEST_PROFILE).toMatchObject({
      email: "sentinel-qa@chupaprecios.com.mx",
      firstName: "Sentinel",
      lastName: "QA Monitor",
    });
    expect(DEFAULT_GUEST_PROFILE.phone).toMatch(/^\d{10}$/);
    expect(DEFAULT_GUEST_PROFILE.postalCode).toMatch(/^\d{5}$/);
    expect(DEFAULT_GUEST_PROFILE.address).toContain(DEFAULT_GUEST_PROFILE.postalCode);
    expect(DEFAULT_GUEST_PROFILE.references).toMatch(/sentinel/i);
  });

  it("fits the site's 20-character name fields", () => {
    expect(DEFAULT_GUEST_PROFILE.firstName.length).toBeLessThanOrEqual(20);
    expect(DEFAULT_GUEST_PROFILE.lastName.length).toBeLessThanOrEqual(20);
  });

  it("lets every field be overridden from SENTINEL_GUEST_* variables", () => {
    const profile = guestProfileFromEnv({
      SENTINEL_GUEST_EMAIL: "other@example.test",
      SENTINEL_GUEST_FIRST_NAME: "Otro",
      SENTINEL_GUEST_LAST_NAME: "Monitor",
      SENTINEL_GUEST_PHONE: "5511112222",
      SENTINEL_GUEST_ADDRESS: "Insurgentes Sur 1000, 03100 Ciudad de México",
      SENTINEL_GUEST_POSTAL_CODE: "03100",
      SENTINEL_GUEST_REFERENCES: "Prueba",
    });
    expect(profile).toEqual({
      email: "other@example.test",
      firstName: "Otro",
      lastName: "Monitor",
      phone: "5511112222",
      address: "Insurgentes Sur 1000, 03100 Ciudad de México",
      postalCode: "03100",
      references: "Prueba",
    });
  });

  it("keeps the defaults for unset or blank variables", () => {
    expect(guestProfileFromEnv({ SENTINEL_GUEST_EMAIL: "  " })).toEqual(DEFAULT_GUEST_PROFILE);
  });
});
