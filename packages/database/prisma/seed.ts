import { PrismaClient } from "@prisma/client";

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
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
