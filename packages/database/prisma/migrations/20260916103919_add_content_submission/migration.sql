-- CreateTable
CREATE TABLE "content_submissions" (
    "id" TEXT NOT NULL,
    "parentAccountId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "submittedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "content_submissions_parentAccountId_idx" ON "content_submissions"("parentAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "content_submissions_parentAccountId_contentId_key" ON "content_submissions"("parentAccountId", "contentId");

-- AddForeignKey
ALTER TABLE "content_submissions" ADD CONSTRAINT "content_submissions_parentAccountId_fkey" FOREIGN KEY ("parentAccountId") REFERENCES "parent_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_submissions" ADD CONSTRAINT "content_submissions_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "content"("id") ON DELETE CASCADE ON UPDATE CASCADE;
