import { db } from "@/lib/db";

/**
 * Load a booking + the shop owner so we can check roles (no RLS in Postgres).
 * Shared between bookings.ts and booking-disputes.ts to avoid circular imports.
 */
export async function loadBooking(bookingId: string) {
  return db.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      renterId: true,
      shopId: true,
      status: true,
      shop: {
        select: {
          ownerId: true,
          promptpayId: true,
          bankName: true,
          bankAccountNumber: true,
          bankAccountName: true,
          defaultPaymentMethod: true,
        },
      },
      renter: { select: { email: true } },
      items: { select: { id: true, unitId: true, product: { select: { name: true } } } },
    },
  });
}
