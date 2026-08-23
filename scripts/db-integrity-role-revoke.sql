\set ON_ERROR_STOP on

\if :{?capture_login}
\else
  \warn 'capture_login is required; pass --set=capture_login=<existing-login-role>'
  SELECT 1 / 0;
\endif

SELECT count(*) = 1 AS capture_role_exists
FROM pg_catalog.pg_roles
WHERE rolname = :'capture_login'
\gset
\if :capture_role_exists
\else
  \warn 'capture_login does not name an existing PostgreSQL role'
  SELECT 1 / 0;
\endif

SELECT count(*) = 1 AS integrity_group_exists
FROM pg_catalog.pg_roles
WHERE rolname = 'pms_db_integrity'
\gset
\if :integrity_group_exists
\else
  \warn 'pms_db_integrity does not exist; cleanup state is unknown'
  SELECT 1 / 0;
\endif

REVOKE pms_db_integrity FROM :"capture_login";

SELECT NOT pg_has_role(:'capture_login', 'pms_db_integrity', 'MEMBER') AS membership_removed
\gset
\if :membership_removed
\else
  \warn 'capture_login is still a member of pms_db_integrity'
  SELECT 1 / 0;
\endif

ALTER ROLE :"capture_login" RESET default_transaction_read_only;
