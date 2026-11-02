-- AlterTable
ALTER TABLE "playlists" ADD COLUMN     "sourceCuratedPlaylistId" TEXT;

-- CreateTable
CREATE TABLE "curated_playlists" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdByUserId" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "curated_playlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curated_playlist_items" (
    "id" TEXT NOT NULL,
    "curatedPlaylistId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "curated_playlist_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "curated_playlist_items_curatedPlaylistId_idx" ON "curated_playlist_items"("curatedPlaylistId");

-- CreateIndex
CREATE UNIQUE INDEX "curated_playlist_items_curatedPlaylistId_contentId_key" ON "curated_playlist_items"("curatedPlaylistId", "contentId");

-- CreateIndex
CREATE UNIQUE INDEX "playlists_ownerParentAccountId_sourceCuratedPlaylistId_key" ON "playlists"("ownerParentAccountId", "sourceCuratedPlaylistId");

-- AddForeignKey
ALTER TABLE "playlists" ADD CONSTRAINT "playlists_sourceCuratedPlaylistId_fkey" FOREIGN KEY ("sourceCuratedPlaylistId") REFERENCES "curated_playlists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curated_playlists" ADD CONSTRAINT "curated_playlists_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curated_playlist_items" ADD CONSTRAINT "curated_playlist_items_curatedPlaylistId_fkey" FOREIGN KEY ("curatedPlaylistId") REFERENCES "curated_playlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curated_playlist_items" ADD CONSTRAINT "curated_playlist_items_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "content"("id") ON DELETE CASCADE ON UPDATE CASCADE;
