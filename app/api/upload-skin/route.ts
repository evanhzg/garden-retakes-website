import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { Client } from 'basic-ftp';

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        
        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        
        // Ensure directory exists
        const uploadDir = path.join(process.cwd(), 'data', 'custom_skins');
        await fs.mkdir(uploadDir, { recursive: true });
        
        // Save the file locally first
        const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const filePath = path.join(uploadDir, safeName);
        await fs.writeFile(filePath, buffer);

        // Upload to Game Server via FTP
        if (process.env.GAMESERVER_FTP_HOST) {
            const client = new Client();
            try {
                await client.access({
                    host: process.env.GAMESERVER_FTP_HOST,
                    port: Number(process.env.GAMESERVER_FTP_PORT || 21),
                    user: process.env.GAMESERVER_FTP_USER,
                    password: process.env.GAMESERVER_FTP_PASSWORD,
                    secure: /^(1|true|yes)$/i.test(process.env.GAMESERVER_FTP_SECURE || "")
                });

                // By default, assuming CS2 custom folder is /csgo/custom/
                // (or root if it's already jailed to csgo)
                const remotePath = `/csgo/custom/${safeName}`;
                try {
                    await client.ensureDir("/csgo/custom");
                } catch {
                    // Ignore dir creation errors if we don't have permissions or it exists
                }
                await client.uploadFrom(filePath, remotePath);
            } catch (ftpError: any) {
                console.error("FTP Error:", ftpError);
                return NextResponse.json({ error: `File saved locally, but FTP upload failed: ${ftpError.message}` }, { status: 500 });
            } finally {
                client.close();
            }
        } else {
            return NextResponse.json({ error: 'File saved locally, but no GAMESERVER_FTP_HOST configured' }, { status: 500 });
        }
        
        return NextResponse.json({ success: true, filename: safeName, message: `Successfully uploaded ${safeName} to the game server.` });
    } catch (error: any) {
        console.error('Error uploading skin:', error);
        return NextResponse.json({ error: error.message || 'Failed to upload skin' }, { status: 500 });
    }
}
