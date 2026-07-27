const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const stats = await prisma.playerSeasonStats.findMany();
    console.log("Stats:", stats);
    const profiles = await prisma.playerProfile.findMany();
    console.log("Profiles:", profiles);
}
main().catch(console.error).finally(() => prisma.$disconnect());
