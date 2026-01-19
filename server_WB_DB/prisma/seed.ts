import { PrismaClient } from "../generated/prisma/index.js";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
    const firstName = "admin";
    const lastName = "admin";
    const password = "admin";

    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.user.upsert({
        where: {
            firstName_lastName: { firstName, lastName },
        },
        update: {
            role: "ADMIN",
            passwordHash,
        },
        create: {
            firstName,
            lastName,
            role: "ADMIN",
            passwordHash,
        },
    });

    console.log("✅ Seed executed: admin/admin ensured");
}

main()
    .catch((e) => {
        console.error("❌ Seed failed:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
