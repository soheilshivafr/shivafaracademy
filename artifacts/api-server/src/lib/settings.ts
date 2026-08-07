import { db } from "@workspace/db";
import { siteSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function getAdminSetting(key: string): Promise<string | null> {
  const [row] = await db
    .select({ value: siteSettingsTable.value })
    .from(siteSettingsTable)
    .where(eq(siteSettingsTable.key, key))
    .limit(1);
  return row?.value ?? null;
}

export async function setAdminSetting(key: string, value: string): Promise<void> {
  await db
    .insert(siteSettingsTable)
    .values({ key, value })
    .onConflictDoUpdate({
      target: siteSettingsTable.key,
      set: { value, updatedAt: new Date() },
    });
}

export async function getCardInfo() {
  const [cardNumber, cardHolder, bankName, shebaNumber] = await Promise.all([
    getAdminSetting("card_to_card_number"),
    getAdminSetting("card_to_card_holder"),
    getAdminSetting("card_to_card_bank"),
    getAdminSetting("card_to_card_sheba"),
  ]);
  return {
    cardNumber: cardNumber ?? "",
    cardHolder: cardHolder ?? "",
    bankName: bankName ?? "",
    shebaNumber: shebaNumber ?? "",
  };
}
