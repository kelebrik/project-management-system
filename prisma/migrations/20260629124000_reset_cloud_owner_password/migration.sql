UPDATE "User"
SET "role" = 'ADMIN',
    "isActive" = true,
    "passwordHash" = 'scrypt:rPpX_YTux22QZSRxaRMbfA:kvZy0z8xM3JQPT12GX-FOPDCKzmqsFeJ4Jt5MkztVay5EY_1i6xH_f2AqHoixDIy-VMtWLFkkTet_kL6B1DaPg'
WHERE lower("email") = lower('kelebrik@gmail.com');
