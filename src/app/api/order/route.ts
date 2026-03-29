import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { COLLECTIONS } from "@/lib/constants";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import {
  calculateSellingRate,
  calculateTotalCost,
  createProviderOrder,
  fetchProviderServices,
  parseProviderNumber,
  type ProviderService,
} from "@/lib/provider";
import { parseRefillWindowHours } from "@/lib/refill-utils";

export const runtime = "nodejs";

interface OrderRequestBody {
  serviceId?: unknown;
  link?: unknown;
  quantity?: unknown;
  userId?: unknown;
}

function getBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.slice("Bearer ".length).trim();
}

function toPositiveInteger(value: unknown): number | null {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function findRequestedService(
  services: ProviderService[],
  serviceId: string
): ProviderService | null {
  return (
    services.find((service) => String(service.service ?? "") === serviceId) ?? null
  );
}

export async function POST(request: NextRequest) {
  let body: OrderRequestBody;

  try {
    body = (await request.json()) as OrderRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const token = getBearerToken(request.headers.get("authorization"));

  if (!token) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let decodedToken;

  try {
    decodedToken = await getAdminAuth().verifyIdToken(token);
  } catch (error) {
    console.error("Failed to verify Firebase ID token:", error);
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const serviceId =
    typeof body.serviceId === "string" ? body.serviceId.trim() : "";
  const link = typeof body.link === "string" ? body.link.trim() : "";
  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const quantity = toPositiveInteger(body.quantity);

  if (!serviceId || !link || !userId || quantity === null) {
    return NextResponse.json(
      { error: "serviceId, link, quantity, and userId are required." },
      { status: 400 }
    );
  }

  if (decodedToken.uid !== userId) {
    return NextResponse.json(
      { error: "You can only place orders for your own account." },
      { status: 403 }
    );
  }

  try {
    const providerServices = await fetchProviderServices();
    const requestedService = findRequestedService(providerServices, serviceId);

    if (!requestedService) {
      return NextResponse.json(
        { error: "Selected service was not found." },
        { status: 404 }
      );
    }

    const providerRate = parseProviderNumber(requestedService.rate);
    const serviceMin = Math.max(1, Math.trunc(parseProviderNumber(requestedService.min, 1)));
    const serviceMax = Math.max(serviceMin, Math.trunc(parseProviderNumber(requestedService.max, serviceMin)));

    if (quantity < serviceMin || quantity > serviceMax) {
      return NextResponse.json(
        {
          error: `Quantity must be between ${serviceMin} and ${serviceMax} for this service.`,
        },
        { status: 400 }
      );
    }

    const ourSellingPrice = calculateSellingRate(providerRate);
    const totalCost = calculateTotalCost(ourSellingPrice, quantity);
    const providerCharge = calculateTotalCost(providerRate, quantity);

    const adminDb = getAdminDb();
    const userRef = adminDb.collection(COLLECTIONS.users).doc(userId);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const currentBalance = Number(userSnap.get("balance") ?? 0);

    if (!Number.isFinite(currentBalance) || currentBalance < totalCost) {
      return NextResponse.json({ error: "Insufficient funds" }, { status: 400 });
    }

    let providerOrderId: string;

    try {
      providerOrderId = await createProviderOrder({
        serviceId,
        link,
        quantity,
      });
    } catch (providerError) {
      console.error("Provider rejected order:", providerError);
      return NextResponse.json(
        {
          error:
            providerError instanceof Error
              ? providerError.message
              : "Provider request failed.",
        },
        { status: 502 }
      );
    }

    const orderRef = adminDb.collection(COLLECTIONS.orders).doc();

    try {
      await adminDb.runTransaction(async (transaction) => {
        const freshUserSnap = await transaction.get(userRef);

        if (!freshUserSnap.exists) {
          throw new Error("USER_NOT_FOUND");
        }

        const freshBalance = Number(freshUserSnap.get("balance") ?? 0);

        if (!Number.isFinite(freshBalance) || freshBalance < totalCost) {
          throw new Error("INSUFFICIENT_FUNDS");
        }

        transaction.update(userRef, {
          balance: Number((freshBalance - totalCost).toFixed(2)),
        });

        const refillWindowHours = parseRefillWindowHours(
          requestedService.name ?? "",
          Boolean(requestedService.refill)
        );

        transaction.set(orderRef, {
          userId,
          userEmail:
            typeof freshUserSnap.get("email") === "string"
              ? freshUserSnap.get("email")
              : decodedToken.email ?? "",
          serviceId,
          serviceName: requestedService.name ?? "",
          category: requestedService.category ?? "",
          link,
          quantity,
          charge: totalCost,
          providerCharge,
          supportsRefill: Boolean(requestedService.refill),
          refillWindowHours: refillWindowHours === Infinity ? 999999 : refillWindowHours,
          refundState: "none",
          providerOrderId,
          status: "pending",
          createdAt: FieldValue.serverTimestamp(),
        });
      });
    } catch (transactionError) {
      console.error("Order transaction failed:", transactionError);

      if (
        transactionError instanceof Error &&
        transactionError.message === "INSUFFICIENT_FUNDS"
      ) {
        return NextResponse.json({ error: "Insufficient funds" }, { status: 400 });
      }

      return NextResponse.json(
        {
          error:
            "Order was accepted by the provider, but local processing failed. Please contact admin.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      orderId: orderRef.id,
      providerOrderId,
      charge: totalCost,
      providerCharge,
    });
  } catch (error) {
    console.error("Order API route failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to place order right now.",
      },
      { status: 500 }
    );
  }
}
