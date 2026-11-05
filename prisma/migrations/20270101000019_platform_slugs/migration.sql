-- #platforms: every platform gets a slug agents can name it by ("desktop", "web", "mobile").
ALTER TABLE "Category" ADD COLUMN "slug" TEXT;

-- The slug is the name, lowercased, with runs of anything but a-z and 0-9 made one dash
-- (lib/platforms.ts `platformSlug`); "platform" when nothing is left. Two names that give
-- the same slug in one workspace: the oldest keeps it, the others get -2, -3, ...
WITH base AS (
  SELECT
    "id",
    "tenantId",
    "createdAt",
    COALESCE(NULLIF(btrim(regexp_replace(lower("name"), '[^a-z0-9]+', '-', 'g'), '-'), ''), 'platform') AS slug
  FROM "Category"
),
numbered AS (
  SELECT "id", slug, row_number() OVER (PARTITION BY "tenantId", slug ORDER BY "createdAt", "id") AS n
  FROM base
)
UPDATE "Category" AS c
SET "slug" = CASE WHEN numbered.n = 1 THEN numbered.slug ELSE numbered.slug || '-' || numbered.n END
FROM numbered
WHERE numbered."id" = c."id";

ALTER TABLE "Category" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "Category_tenantId_slug_key" ON "Category"("tenantId", "slug");
