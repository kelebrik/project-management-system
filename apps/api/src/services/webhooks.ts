import { createHmac } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';

function asEventList(value: Prisma.JsonValue) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function shouldDeliver(events: string[], eventType: string) {
  return events.includes('*') || events.includes(eventType);
}

function signature(secret: string, payload: string) {
  return createHmac('sha256', secret).update(payload).digest('hex');
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

  await Promise.all(
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
        try {
          const response = await fetch(endpoint.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-PMS-Event': input.eventType,
              'X-PMS-Delivery': delivery.id,
              ...(endpoint.secret
                ? { 'X-PMS-Signature': `sha256=${signature(endpoint.secret, payload)}` }
                : {}),
            },
            body: payload,
          });
          const responseBody = await response.text();
          await prisma.webhookDelivery.update({
            where: { id: delivery.id },
            data: {
              status: response.ok ? 'DELIVERED' : 'FAILED',
              statusCode: response.status,
              responseBody: responseBody.slice(0, 4_000),
              attemptedAt: new Date(),
            },
          });
        } catch (error) {
          await prisma.webhookDelivery.update({
            where: { id: delivery.id },
            data: {
              status: 'FAILED',
              error: error instanceof Error ? error.message : String(error),
              attemptedAt: new Date(),
            },
          });
        }
      }),
  );
}
