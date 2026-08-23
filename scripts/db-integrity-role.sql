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

SELECT NOT (
  rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls
) AS capture_role_attributes_safe
FROM pg_catalog.pg_roles
WHERE rolname = :'capture_login'
\gset
\if :capture_role_attributes_safe
\else
  \warn 'capture_login has elevated cluster attributes and cannot be used for integrity capture'
  SELECT 1 / 0;
\endif

SELECT NOT EXISTS (
  SELECT 1
  FROM pg_catalog.pg_roles AS inherited_role
  WHERE inherited_role.rolname <> :'capture_login'
    AND (
      inherited_role.rolsuper
      OR inherited_role.rolcreaterole
      OR inherited_role.rolcreatedb
      OR inherited_role.rolreplication
      OR inherited_role.rolbypassrls
    )
    AND pg_has_role(:'capture_login', inherited_role.oid, 'MEMBER')
) AS capture_role_has_no_elevated_membership
\gset
\if :capture_role_has_no_elevated_membership
\else
  \warn 'capture_login is a member of an elevated cluster role'
  SELECT 1 / 0;
\endif

SELECT NOT EXISTS (
  SELECT 1
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
    AND namespace.nspname NOT LIKE 'pg_toast%'
    AND relation.relkind IN ('r', 'p', 'S', 'v', 'm', 'f')
    AND pg_has_role(:'capture_login', relation.relowner, 'MEMBER')
) AS capture_role_owns_no_user_relations
\gset
\if :capture_role_owns_no_user_relations
\else
  \warn 'capture_login owns user relations and therefore has implicit write privileges'
  SELECT 1 / 0;
\endif

SELECT NOT EXISTS (
  SELECT 1
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
    AND namespace.nspname NOT LIKE 'pg_toast%'
    AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND (
      has_table_privilege(:'capture_login', relation.oid, 'INSERT')
      OR has_table_privilege(:'capture_login', relation.oid, 'UPDATE')
      OR has_table_privilege(:'capture_login', relation.oid, 'DELETE')
      OR has_table_privilege(:'capture_login', relation.oid, 'TRUNCATE')
    )
) AS capture_role_has_no_table_write
\gset
\if :capture_role_has_no_table_write
\else
  \warn 'capture_login already has write privileges on user tables'
  SELECT 1 / 0;
\endif

SELECT NOT EXISTS (
  SELECT 1
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
    AND namespace.nspname NOT LIKE 'pg_toast%'
    AND relation.relkind = 'S'
    AND (
      has_sequence_privilege(:'capture_login', relation.oid, 'USAGE')
      OR has_sequence_privilege(:'capture_login', relation.oid, 'UPDATE')
    )
) AS capture_role_has_no_sequence_write
\gset
\if :capture_role_has_no_sequence_write
\else
  \warn 'capture_login already has write privileges on user sequences'
  SELECT 1 / 0;
\endif

SELECT format(
  'CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS',
  'pms_db_integrity'
)
WHERE NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'pms_db_integrity'
)
\gexec

ALTER ROLE pms_db_integrity
  NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS;
GRANT pg_read_all_data TO pms_db_integrity;
GRANT pg_read_all_stats TO pms_db_integrity;
GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO pms_db_integrity;
GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_checkpoint() TO pms_db_integrity;
GRANT pms_db_integrity TO :"capture_login";
ALTER ROLE :"capture_login" SET default_transaction_read_only = on;

SELECT
  :'capture_login' AS capture_login,
  pg_has_role(:'capture_login', 'pms_db_integrity', 'MEMBER') AS integrity_member,
  pg_has_role(:'capture_login', 'pg_read_all_data', 'MEMBER') AS read_all_data,
  pg_has_role(:'capture_login', 'pg_read_all_stats', 'MEMBER') AS read_all_stats,
  has_function_privilege(:'capture_login', 'pg_catalog.pg_control_system()', 'EXECUTE')
    AS control_system_execute,
  has_function_privilege(:'capture_login', 'pg_catalog.pg_control_checkpoint()', 'EXECUTE')
    AS control_checkpoint_execute;
