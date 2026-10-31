-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'SCHOOL_ADMIN';

-- CreateEnum
CREATE TYPE "SchoolSubject" AS ENUM ('MATH', 'READING', 'SCIENCE', 'SOCIAL_STUDIES', 'LANGUAGE_ARTS', 'OTHER');

-- CreateEnum
CREATE TYPE "SchoolSeatInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- AlterTable
ALTER TABLE "children" ADD COLUMN     "structuredLearningModeEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "structuredLearningGateEnforced" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "child_content_permissions" ADD COLUMN     "isLearningContent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "subject" "SchoolSubject";

-- AlterTable
ALTER TABLE "parent_accounts" ADD COLUMN     "schoolAccountId" TEXT;

-- CreateTable
CREATE TABLE "learning_queue_states" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL DEFAULT 0,
    "funWatchedInStep" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_queue_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_admin_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "schoolAccountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_admin_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_accounts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'INCOMPLETE',
    "seatCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_seat_invites" (
    "id" TEXT NOT NULL,
    "schoolAccountId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "SchoolSeatInviteStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedByParentAccountId" TEXT,

    CONSTRAINT "school_seat_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "learning_queue_states_deviceId_key" ON "learning_queue_states"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "school_admin_accounts_userId_key" ON "school_admin_accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "school_accounts_contactEmail_key" ON "school_accounts"("contactEmail");

-- CreateIndex
CREATE UNIQUE INDEX "school_accounts_stripeCustomerId_key" ON "school_accounts"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "school_accounts_stripeSubscriptionId_key" ON "school_accounts"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "school_seat_invites_tokenHash_key" ON "school_seat_invites"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "school_seat_invites_acceptedByParentAccountId_key" ON "school_seat_invites"("acceptedByParentAccountId");

-- CreateIndex
CREATE INDEX "school_seat_invites_schoolAccountId_idx" ON "school_seat_invites"("schoolAccountId");

-- AddForeignKey
ALTER TABLE "parent_accounts" ADD CONSTRAINT "parent_accounts_schoolAccountId_fkey" FOREIGN KEY ("schoolAccountId") REFERENCES "school_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_queue_states" ADD CONSTRAINT "learning_queue_states_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_queue_states" ADD CONSTRAINT "learning_queue_states_childId_fkey" FOREIGN KEY ("childId") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_admin_accounts" ADD CONSTRAINT "school_admin_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_admin_accounts" ADD CONSTRAINT "school_admin_accounts_schoolAccountId_fkey" FOREIGN KEY ("schoolAccountId") REFERENCES "school_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_seat_invites" ADD CONSTRAINT "school_seat_invites_schoolAccountId_fkey" FOREIGN KEY ("schoolAccountId") REFERENCES "school_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_seat_invites" ADD CONSTRAINT "school_seat_invites_acceptedByParentAccountId_fkey" FOREIGN KEY ("acceptedByParentAccountId") REFERENCES "parent_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
