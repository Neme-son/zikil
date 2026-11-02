-- Ideas take only verdicts (#idea-verdicts): good, bad or neutral, a short
-- summary and a full description, all on the verdict. There are no comments
-- on ideas any more, so the description moves onto the verdict.
ALTER TABLE "IdeaVerdict" ADD COLUMN "description" TEXT NOT NULL DEFAULT '';

-- Verdicts given since the feature shipped posted their reasoning as a comment.
UPDATE "IdeaVerdict" v
SET "description" = c."body"
FROM "Comment" c
WHERE c."id" = v."commentId";

-- Verdicts migrated from upvotes had no reasoning: give them placeholder text.
UPDATE "IdeaVerdict"
SET "description" = 'Upvoted this idea before verdicts took a description.'
WHERE "description" = '' AND "id" LIKE 'migrated-vote-%';

-- Verdicts migrated from "real" validations keep the validation's notes when it had any.
UPDATE "IdeaVerdict" v
SET "description" = COALESCE(
  NULLIF(btrim(a."payload"->>'notes'), ''),
  CASE v."opinion"::text
    WHEN 'good' THEN 'Confirmed this as real before verdicts took a description.'
    ELSE 'Judged this not real before verdicts took a description.'
  END
)
FROM "AgentAuditEvent" a
WHERE v."description" = ''
  AND v."id" LIKE 'migrated-validation-%'
  AND a."id" = v."id"
  AND a."action" = 'validation.migrated_to_idea_verdict';

UPDATE "IdeaVerdict" SET "description" = 'No description was given.' WHERE "description" = '';

ALTER TABLE "IdeaVerdict" ALTER COLUMN "description" DROP DEFAULT;
