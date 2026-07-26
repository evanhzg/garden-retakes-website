import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(req, { params }) {
    try {
        const { jobId } = params;
        
        if (!jobId) {
            return NextResponse.json({ error: 'Job ID required' }, { status: 400 });
        }

        const job = await prisma.skinJob.findUnique({
            where: { id: parseInt(jobId, 10) }
        });

        if (!job) {
            return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }

        return NextResponse.json({ status: job.status }, { status: 200 });
    } catch (error) {
        console.error('Error fetching job status:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
