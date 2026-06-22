import { createHmac } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { logEvent } from '../server/logger.js';

const webhookTimeoutMs = Math.max(1_000, Number(process.env.WEBHOOK_TIMEOUT_MS ?? 5_000));
const webhookMaxAttempts = Math.max(1, Number(process.env.WEBHOOK_MAX_ATTEMPTS ?? 3));
const webhookRetryBaseMs = Math.max(100, Number(process.env.WEBHOOK_RETRY_BASE_MS ?? 500));

function asEventList(value: Prisma.JsonValue) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function shouldDeliver(events: string[], eventType: string) {
  return events.includes('*') || events.includes(eventType);
}

function signature(secret: string, payload: string) {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function deliverWebhook(input: {
  deliveryId: string;
  endpointUrl: string;
  endpointSecret: string | null;
  eventType: string;
  payload: string;
}) {
  for (let attempt = 1; attempt <= webhookMaxAttempts; attempt += 1) {
    try {
      const response = await fetch(input.endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-PMS-Event': input.eventType,
          'X-PMS-Delivery': input.deliveryId,
          ...(input.endpointSecret
            ? { 'X-PMS-Signature': `sha256=${signature(input.endpointSecret, input.payload)}` }
            : {}),
        },
        body: input.payload,
        signal: AbortSignal.timeout(webhookTimeoutMs),
      });
      const responseBody = await response.text();
      await prisma.webhookDelivery.update({
        where: { id: input.deliveryId },
        data: {
          status: response.ok ? 'DELIVERED' : attempt < webhookMaxAttempts ? 'RETRYING' : 'FAILED',
          statusCode: response.status,
          responseBody: responseBody.slice(0, 4_000),
          attemptedAt: new Date(),
        },
      });
      if (response.ok) return;
    } catch (error) {
      await prisma.webhookDelivery.update({
        where: { id: input.deliveryId },
        data: {
          status: attempt < webhookMaxAttempts ? 'RETRYING' : 'FAILED',
          error: error instanceof Error ? error.message : String(error),
          attemptedAt: new Date(),
        },
      });
    }

    if (attempt < webhookMaxAttempts) {
      await delay(webhookRetryBaseMs * attempt);
    }
  }
}

function enqueueWebhookDelivery(input: Parameters<typeof deliverWebhook>[0]) {
  setTimeout(() => {
    void deliverWebhook(input).catch((error) => {
      logEvent('error', 'webhook.delivery_unhandled_error', {
        deliveryId: input.deliveryId,
        eventType: input.eventType,
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }, 0);
}

export async function emitWebhookEvent(input: {
  eventType: string;
  projectId?: string | null;
  payload: unknown;
}) {
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { isActive: true },
  });
  const payload = JSON.stringify({
    eventType: input.eventType,
    projectId: input.projectId ?? null,
    emittedAt: new Date().toISOString(),
    data: input.payload,
  });

  const deliveries = await Promise.all(
    endpoints
      .filter((endpoint) => shouldDeliver(asEventList(endpoint.events), input.eventType))
      .map(async (endpoint) => {
        const delivery = await prisma.webhookDelivery.create({
          data: {
            endpointId: endpoint.id,
            eventType: input.eventType,
            payload: JSON.parse(payload) as Prisma.InputJsonValue,
          },
        });
        return {
          deliveryId: delivery.id,
          endpointUrl: endpoint.url,
          endpointSecret: endpoint.secret,
          eventType: input.eventType,
          payload,
        };
      }),
  );

  deliveries.forEach(enqueueWebhookDelivery);
}
