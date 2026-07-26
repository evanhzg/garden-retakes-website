import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req) {
    try {
        const { workshopUrl, imageUrl } = await req.json();
        
        if (!workshopUrl || !imageUrl) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
        }

        const job = await prisma.skinJob.create({
            data: {
                workshop_url: workshopUrl,
                image_url: imageUrl,
                status: 'pending'
            }
        });

        return NextResponse.json({ id: job.id }, { status: 200 });
    } catch (error) {
        console.error('Error creating job:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
