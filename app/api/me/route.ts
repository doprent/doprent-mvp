import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getBookingBadges } from "@/lib/booking-queries";
import { getSiteSettings, SETTING_KEYS } from "@/lib/site-settings";

export const dynamic = "force-dynamic";

/**
 * GET /api/me
 *
 * Returns auth-aware session data for use by client-island components
 * (HeaderUserSlot, SaveButton, DateRangePicker, LineButton).  This lets the
 * public page shell be static/ISR while user-specific chrome is fetched
 * client-side after hydration.
 *
 * Shape is intentionally flat to keep the payload small:
 *   user      — null when not logged in
 *   hasShop   — whether the user owns a shop (independent of role)
 *   savedCount— number of products saved to favorites
 *   badges    — renter / seller unread-action counts
 *   staff     — non-null for staff sessions (QR login)
 *   siteLineUrl — site-wide LINE OA URL (from site settings)
 */
export async function GET() {
  const [user, settings] = await Promise.all([
    getCurrentUser().catch(() => null),
    getSiteSettings(),
  ]);

  const siteLineUrl = settings[SETTING_KEYS.LINE_URL] ?? "https://line.me/R/ti/p/@doprent";

  if (!user) {
    // No regular user — check for staff session
    const session = await auth().catch(() => null);
    const isStaff = session?.user?.role === "staff";
    const staffName = isStaff ? (session?.user?.name ?? "พนักงาน") : null;

    return NextResponse.json({
      user: null,
      hasShop: false,
      savedCount: 0,
      badges: { renter: 0, seller: 0 },
      staff: isStaff && staffName !== null ? { name: staffName } : null,
      siteLineUrl,
    });
  }

  const [shopRow, badges] = await Promise.all([
    db.shop.findFirst({
      where: { ownerId: user.id },
      select: { id: true },
    }),
    getBookingBadges(),
  ]);

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      savedProductIds: user.savedProductIds,
    },
    hasShop: shopRow !== null,
    savedCount: user.savedProductIds.length,
    badges,
    staff: null,
    siteLineUrl,
  });
}
