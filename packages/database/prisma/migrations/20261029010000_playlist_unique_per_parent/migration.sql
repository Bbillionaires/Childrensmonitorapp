-- CreateIndex
CREATE UNIQUE INDEX "playlists_ownerParentAccountId_providerId_providerRefId_key" ON "playlists"("ownerParentAccountId", "providerId", "providerRefId");
