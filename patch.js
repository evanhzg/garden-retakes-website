const fs = require('fs');
let schema = fs.readFileSync('prisma/schema.prisma', 'utf8');

if (!schema.includes('AllstarUsername')) {
    schema = schema.replace(
        /model GardenWebProfile {([\s\S]*?)@@map\("GardenWebProfiles"\)\n}/,
        (match, p1) => {
            return `model GardenWebProfile {${p1}  AllstarUsername String?   @db.VarChar(64)\n  AllstarSync     Boolean   @default(true)\n\n  @@map("GardenWebProfiles")\n}`;
        }
    );
    fs.writeFileSync('prisma/schema.prisma', schema);
    console.log('Patched schema.prisma');
} else {
    console.log('Already patched');
}
