import { getAdminMessaging } from "@/lib/firebase-admin";

export async function sendAdminDepositNotification(input: {
  userEmail: string;
  amount: number;
  depositId: string;
}) {
  try {
    await getAdminMessaging().send({
      topic: "admins",
      notification: {
        title: "New deposit request",
        body: `${input.userEmail} submitted a deposit of ₹${input.amount.toFixed(2)}.`,
      },
      data: {
        type: "deposit_created",
        depositId: input.depositId,
      },
      android: {
        priority: "high",
        notification: {
          channelId: "admin_alerts",
          sound: "default",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
          },
        },
      },
    });
  } catch (error) {
    console.error("Failed to send admin deposit notification:", error);
  }
}
