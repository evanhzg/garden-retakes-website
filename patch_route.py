import re

with open("app/api/admin/capture-suggestions/route.ts", "r") as f:
    code = f.read()

# Fix GET
code = re.sub(
    r'export async function GET\(req: NextRequest\) \{\s*const ctx = await getAdminContext\(req\);',
    'export async function GET(req: NextRequest) {\n  const url = new URL(req.url);\n  const key = url.searchParams.get("key");\n  const ctx = await getAdminContext(key);',
    code
)

# Fix PATCH
code = re.sub(
    r'export async function PATCH\(req: NextRequest\) \{\s*const ctx = await getAdminContext\(req\);',
    'export async function PATCH(req: NextRequest) {\n  const body = await req.json();\n  const { id, status, key } = body;\n  const ctx = await getAdminContext(key);',
    code
)

# We also need to avoid reading the body again in PATCH.
# Wait, the code currently does:
#   const body = await req.json();
#   const { id, status } = body;
# If I just add that to the top, it will fail on the second req.json().
code = re.sub(
    r'const body = await req\.json\(\);\n\s*const \{ id, status, key \} = body;\n\s*const ctx = await getAdminContext\(key\);\n\s*if \(ctx\.level < AdminLevel\.Moderator\) \{\n\s*return NextResponse\.json\(\{ error: "Unauthorized" \}, \{ status: 401 \}\);\n\s*\}\n\s*try \{\n\s*const body = await req\.json\(\);\n\s*const \{ id, status \} = body;',
    'const body = await req.json();\n  const { id, status, key } = body;\n  const ctx = await getAdminContext(key);\n  if (ctx.level < AdminLevel.Moderator) {\n    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });\n  }\n  try {',
    code
)

with open("app/api/admin/capture-suggestions/route.ts", "w") as f:
    f.write(code)
