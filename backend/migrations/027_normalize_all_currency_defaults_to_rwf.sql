BEGIN;

DO $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT c.table_schema, c.table_name, c.column_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name = 'currency'
      AND c.data_type IN ('text', 'character varying', 'character')
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ALTER COLUMN %I SET DEFAULT %L',
      target.table_schema,
      target.table_name,
      target.column_name,
      'RWF'
    );

    EXECUTE format(
      'UPDATE %I.%I SET %I = %L WHERE %I IS NULL OR UPPER(%I) = %L OR BTRIM(%I) = %L',
      target.table_schema,
      target.table_name,
      target.column_name,
      'RWF',
      target.column_name,
      target.column_name,
      'USD',
      target.column_name,
      ''
    );
  END LOOP;
END $$;

COMMIT;