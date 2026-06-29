UPDATE "User"
SET "role" = 'ADMIN',
    "isActive" = true
WHERE lower("email") = lower('kelebrik@gmail.com');
