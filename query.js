const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const clips = await prisma.gardenClipRequest.findMany();
  console.log(clips);
}
main().catch(console.error).finally(() => prisma.$disconnect());
