-- Add global search support state, saved views and enterprise integration tables
CREATE TABLE "SavedView" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT,
  "projectId" TEXT,
  "viewType" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "config" JSONB NOT NULL,
  "isShared" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SavedView_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApiToken" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "tokenPrefix" TEXT NOT NULL,
  "scopes" JSONB NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "rateLimitPerMinute" INTEGER NOT NULL DEFAULT 120,
  "expiresAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebhookEndpoint" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "secret" TEXT,
  "events" JSONB NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebhookDelivery" (
  "id" TEXT NOT NULL,
  "endpointId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "statusCode" INTEGER,
  "responseBody" TEXT,
  "error" TEXT,
  "attemptedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApiToken_tokenHash_key" ON "ApiToken"("tokenHash");
CREATE INDEX "SavedView_ownerId_viewType_idx" ON "SavedView"("ownerId", "viewType");
CREATE INDEX "SavedView_projectId_viewType_idx" ON "SavedView"("projectId", "viewType");
CREATE INDEX "SavedView_isShared_viewType_idx" ON "SavedView"("isShared", "viewType");
CREATE INDEX "SavedView_updatedAt_idx" ON "SavedView"("updatedAt");
CREATE INDEX "ApiToken_createdById_idx" ON "ApiToken"("createdById");
CREATE INDEX "ApiToken_isActive_expiresAt_idx" ON "ApiToken"("isActive", "expiresAt");
CREATE INDEX "ApiToken_tokenPrefix_idx" ON "ApiToken"("tokenPrefix");
CREATE INDEX "WebhookEndpoint_createdById_idx" ON "WebhookEndpoint"("createdById");
CREATE INDEX "WebhookEndpoint_isActive_idx" ON "WebhookEndpoint"("isActive");
CREATE INDEX "WebhookDelivery_endpointId_createdAt_idx" ON "WebhookDelivery"("endpointId", "createdAt");
CREATE INDEX "WebhookDelivery_eventType_createdAt_idx" ON "WebhookDelivery"("eventType", "createdAt");
CREATE INDEX "WebhookDelivery_status_createdAt_idx" ON "WebhookDelivery"("status", "createdAt");

ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

