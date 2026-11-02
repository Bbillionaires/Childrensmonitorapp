import { PrismaClient } from "@prisma/client";
import { hashPassword } from "@app/auth";

const prisma = new PrismaClient();

const SAFETY_CATEGORIES: Array<{ id: string; displayName: string; weight: number }> = [
  { id: "violence", displayName: "Violence", weight: 1.2 },
  { id: "sexual_content", displayName: "Sexual Content", weight: 1.5 },
  { id: "nudity", displayName: "Nudity", weight: 1.5 },
  { id: "grooming_indicators", displayName: "Potential Grooming Indicators", weight: 1.8 },
  { id: "fear", displayName: "Fear", weight: 1.0 },
  { id: "disturbing_imagery", displayName: "Disturbing Imagery", weight: 1.1 },
  { id: "jump_scares", displayName: "Jump Scares", weight: 0.8 },
  { id: "profanity", displayName: "Profanity / Language", weight: 1.0 },
  { id: "drugs", displayName: "Drugs", weight: 1.2 },
  { id: "alcohol", displayName: "Alcohol", weight: 1.0 },
  { id: "weapons", displayName: "Weapons", weight: 1.1 },
  { id: "self_harm", displayName: "Self-Harm", weight: 1.8 },
  { id: "dangerous_challenges", displayName: "Dangerous Challenges", weight: 1.4 },
  { id: "bullying", displayName: "Bullying", weight: 1.1 },
  { id: "adult_themes", displayName: "Adult Themes", weight: 1.0 },
  { id: "advertising_manipulation", displayName: "Advertising Manipulation", weight: 0.8 },
  { id: "gambling", displayName: "Gambling", weight: 1.2 },
  { id: "external_link_risk", displayName: "External-Link Risk", weight: 1.0 },
  { id: "hate_extremism", displayName: "Hate / Extremist Content", weight: 1.6 },
  { id: "age_appropriateness", displayName: "Age Appropriateness", weight: 1.3 },
];

const CONTENT_PROVIDERS: Array<{ id: string; displayName: string; requiresOfficialApi: boolean }> = [
  { id: "youtube", displayName: "YouTube", requiresOfficialApi: true },
  { id: "vimeo", displayName: "Vimeo", requiresOfficialApi: true },
  { id: "website", displayName: "Approved Website", requiresOfficialApi: false },
];

async function main() {
  for (const category of SAFETY_CATEGORIES) {
    await prisma.safetyCategory.upsert({
      where: { id: category.id },
      update: { displayName: category.displayName, weight: category.weight },
      create: category,
    });
  }

  for (const provider of CONTENT_PROVIDERS) {
    await prisma.contentProvider.upsert({
      where: { id: provider.id },
      update: { displayName: provider.displayName },
      create: provider,
    });
  }

  console.log(
    `Seeded ${SAFETY_CATEGORIES.length} safety categories and ${CONTENT_PROVIDERS.length} content providers.`,
  );

  // Milestone 12: provisions the first admin console login from ADMIN_BOOTSTRAP_EMAIL/
  // ADMIN_BOOTSTRAP_PASSWORD, since there is no public admin registration endpoint. Idempotent
  // once converted: an existing User whose role is already ADMIN is left untouched (keeps its
  // current password rather than being silently reset on every deploy).
  //
  // If ADMIN_BOOTSTRAP_EMAIL belongs to an existing non-admin User (e.g. a parent who
  // registered through the normal signup flow before being designated an admin), this
  // *converts* that account: its ParentAccount/SchoolAdminAccount (and everything cascading
  // from it — children, playlists, approvals) is deleted, and the User becomes a pure ADMIN
  // login with the given password. This is deliberate, operator-only, one-time-per-email
  // behavior — only someone with Railway environment-variable access can trigger it, and only
  // by pointing this var at a specific email on purpose. Confirmed explicitly with the
  // account owner before using this for helpthekidswin@gmail.com (an empty/disposable parent
  // account) — see ADMIN_CONSOLE.md.
  const bootstrapEmail = process.env.ADMIN_BOOTSTRAP_EMAIL;
  const bootstrapPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (bootstrapEmail && bootstrapPassword) {
    const existing = await prisma.user.findUnique({ where: { email: bootstrapEmail } });
    const passwordHash = await hashPassword(bootstrapPassword);
    if (!existing) {
      await prisma.user.create({
        data: { email: bootstrapEmail, passwordHash, role: "ADMIN" },
      });
      console.log(`Provisioned admin account for ${bootstrapEmail}.`);
    } else if (existing.role !== "ADMIN") {
      await prisma.$transaction([
        prisma.parentAccount.deleteMany({ where: { userId: existing.id } }),
        prisma.schoolAdminAccount.deleteMany({ where: { userId: existing.id } }),
        prisma.user.update({ where: { id: existing.id }, data: { role: "ADMIN", passwordHash } }),
      ]);
      console.log(`Converted existing account at ${bootstrapEmail} to an admin login.`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
