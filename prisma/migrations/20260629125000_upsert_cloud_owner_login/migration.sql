INSERT INTO "User" (
  "id",
  "email",
  "name",
  "role",
  "isActive",
  "passwordHash",
  "createdAt",
  "updatedAt"
)
VALUES (
  'user_kelebrik_cloud_owner',
  'kelebrik@gmail.com',
  'Kelebrik',
  'ADMIN',
  true,
  'scrypt:rPpX_YTux22QZSRxaRMbfA:kvZy0z8xM3JQPT12GX-FOPDCKzmqsFeJ4Jt5MkztVay5EY_1i6xH_f2AqHoixDIy-VMtWLFkkTet_kL6B1DaPg',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("email") DO UPDATE
SET
  "role" = 'ADMIN',
  "isActive" = true,
  "passwordHash" = EXCLUDED."passwordHash",
  "updatedAt" = CURRENT_TIMESTAMP;
