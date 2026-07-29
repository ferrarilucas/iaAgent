BEGIN;

WITH norm AS (
  SELECT
    id,
    CASE
      WHEN length(d) = 13 AND left(d, 2) = '55' THEN d
      WHEN length(d) = 12 AND left(d, 2) = '55' THEN left(d, 4) || '9' || substr(d, 5)
      WHEN length(d) = 11 THEN '55' || d
      WHEN length(d) = 10 THEN '55' || left(d, 2) || '9' || substr(d, 3)
      ELSE d
    END AS canonical
  FROM (
    SELECT id, regexp_replace(whatsapp_number, '\D', '', 'g') AS d FROM users
  ) s
)
UPDATE users u
SET whatsapp_number = n.canonical,
    phone_number = n.canonical
FROM norm n
WHERE u.id = n.id
  AND (u.whatsapp_number IS DISTINCT FROM n.canonical OR u.phone_number IS DISTINCT FROM n.canonical);

WITH norm AS (
  SELECT
    id,
    CASE
      WHEN length(d) = 13 AND left(d, 2) = '55' THEN d
      WHEN length(d) = 12 AND left(d, 2) = '55' THEN left(d, 4) || '9' || substr(d, 5)
      WHEN length(d) = 11 THEN '55' || d
      WHEN length(d) = 10 THEN '55' || left(d, 2) || '9' || substr(d, 3)
      ELSE d
    END AS canonical
  FROM (
    SELECT id, regexp_replace(invited_number, '\D', '', 'g') AS d FROM invitations
  ) s
)
UPDATE invitations i
SET invited_number = n.canonical
FROM norm n
WHERE i.id = n.id
  AND i.invited_number IS DISTINCT FROM n.canonical;

COMMIT;
